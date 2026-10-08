import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { resolverPreco } from '../utils/preco';
import { requerPermissao } from '../middlewares/auth';

const router = Router();

// Campos fiscais aceitos no cadastro (texto livre, validados no tamanho)
const CAMPOS_FISCAIS: Record<string, string> = { ncm: 'ncm', cest: 'cest', cfop: 'cfop', csosn: 'csosn', cst: 'cst' };
const fiscaisDoCorpo = (body: any, existente?: any) => {
    const out: any = {};
    for (const [campo, coluna] of Object.entries(CAMPOS_FISCAIS)) {
        if (body[campo] === undefined) continue;
        const v = String(body[campo] ?? '').replace(/[^0-9A-Za-z.]/g, '').slice(0, 12);
        out[coluna] = v || null;
    }
    void existente;
    return out;
};
// Foto: data URL de imagem (até ~1,5 MB). null/'' remove.
const fotosDoCorpo = (foto: any): string[] | undefined => {
    if (foto === undefined) return undefined;
    if (!foto) return [];
    const f = String(foto);
    if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(f) || f.length > 2_000_000) return undefined;
    return [f];
};
const inteiroOuNull = (v: any) => (v === undefined ? undefined : Math.max(0, Math.round(Number(v) || 0)));

// GET /api/produtos - Lista produtos (com estoque e categoria), busca opcional
router.get('/', async (req: any, res: any) => {
    const { busca } = req.query;

    const where = busca
        ? {
            OR: [
                { name: { contains: String(busca), mode: 'insensitive' as const } },
                { barcode: { contains: String(busca) } },
                { sku: { contains: String(busca), mode: 'insensitive' as const } }
            ]
        }
        : {};

    const produtos = await prisma.product.findMany({
        where,
        include: {
            Category: true,
            Brand: true,
            Collection: true,
            ProductVariant: true,
            Inventory: { include: { Branch: true, ProductVariant: true } }
        },
        orderBy: { name: 'asc' }
    });

    return res.json(produtos.map(p => ({
        id: p.id,
        nome: p.name,
        codigo: p.barcode,
        sku: p.sku,
        preco: Number(p.salePrice),
        custo: Number(p.costPrice),
        margem: Number(p.profitMargin),
        categoriaId: p.categoryId,
        categoria: p.Category?.name ?? null,
        marcaId: p.brandId,
        marca: p.Brand?.name ?? null,
        colecaoId: p.collectionId,
        colecao: p.Collection?.name ?? null,
        variantes: p.ProductVariant.map(v => ({
            id: v.id,
            cor: v.color,
            tamanho: v.size,
            sku: v.sku,
            codigo: v.barcode,
            preco: Number(v.salePrice ?? p.salePrice),
            custo: Number(v.costPrice ?? p.costPrice),
            estoque: p.Inventory.filter(i => i.variantId === v.id).reduce((s, i) => s + i.quantity, 0)
        })),
        estoque: p.Inventory.reduce((s, i) => s + i.quantity, 0),
        minimo: p.Inventory.reduce((s, i) => s + i.minQuantity, 0),
        maximo: p.Inventory.reduce((s, i) => s + (i.maxQuantity ?? 0), 0),
        ativo: p.isActive,
        unidade: p.unit,
        descricao: p.description,
        foto: p.photos?.[0] ?? null,
        ncm: p.ncm, cest: p.cest, cfop: p.cfop, csosn: p.csosn, cst: p.cst
    })));
});

// GET /api/produtos/:codigo - PDV: busca produto (ou variante) pelo código de barras ou SKU
// Aceita ?clienteId= e ?qtd= para aplicar a tabela de preço do cliente
router.get('/:codigo', async (req: any, res: any) => {
    const { codigo } = req.params;
    const clienteId = req.query.clienteId || null;
    const qtd = Math.max(1, Number(req.query.qtd ?? 1));

    const variante = await prisma.productVariant.findFirst({
        where: { OR: [{ barcode: codigo }, { sku: codigo }] },
        include: { Product: true }
    });

    if (variante) {
        const base = Number(variante.salePrice ?? variante.Product.salePrice);
        const preco = (await resolverPreco(variante.Product.id, variante.id, clienteId, qtd, base)) ?? base;
        return res.json({
            id: variante.Product.id,
            codigo: variante.barcode ?? variante.sku,
            descricao: `${variante.Product.name}${variante.color ? ' - ' + variante.color : ''}${variante.size ? ' ' + variante.size : ''}`,
            preco: Number(preco.toFixed(2)),
            precoBase: base
        });
    }

    const produto = await prisma.product.findFirst({
        where: {
            OR: [{ barcode: codigo }, { sku: codigo }],
            isActive: true
        }
    });

    if (!produto) {
        return res.status(404).json({ erro: "Produto não encontrado!" });
    }

    const base = Number(produto.salePrice);
    const preco = (await resolverPreco(produto.id, null, clienteId, qtd, base)) ?? base;

    return res.json({
        id: produto.id,
        codigo: produto.barcode ?? produto.sku,
        descricao: produto.name,
        preco: Number(preco.toFixed(2)),
        precoBase: base
    });
});

// POST /api/produtos - Cria um novo produto com estoque inicial e variantes opcionais
router.post('/', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { nome, codigo, sku, preco, custo, categoriaId, marcaId, colecaoId, estoque, unidade, variantes, minimo, maximo, descricao, foto } = req.body;

    if (!nome || nome.trim() === '') {
        return res.status(400).json({ erro: "Informe o nome do produto!" });
    }

    const precoNum = Number(preco);
    if (!Number.isFinite(precoNum) || precoNum <= 0) {
        return res.status(400).json({ erro: "Preço de venda inválido!" });
    }

    let custoNum = 0;
    if (custo !== undefined && custo !== null && custo !== '') {
        custoNum = Number(custo);
        if (!Number.isFinite(custoNum) || custoNum < 0) {
            return res.status(400).json({ erro: "Custo inválido!" });
        }
    }

    if (codigo && await prisma.product.findFirst({ where: { barcode: codigo } })) {
        return res.status(400).json({ erro: "Código de barras já cadastrado!" });
    }

    const empresa = await prisma.company.findUnique({ where: { id: req.operador.companyId } });
    const filial = req.operador.branchId
        ? await prisma.branch.findUnique({ where: { id: req.operador.branchId } })
        : await prisma.branch.findFirst({ where: { companyId: req.operador.companyId } });
    if (!empresa || !filial) {
        return res.status(400).json({ erro: "Empresa ou filial não configuradas!" });
    }

    const margem = precoNum > 0 ? ((precoNum - custoNum) / precoNum * 100) : 0;

    const produto = await prisma.product.create({
        data: {
            id: randomUUID(),
            companyId: empresa.id,
            name: nome.trim().toUpperCase(),
            barcode: codigo || null,
            sku: sku || null,
            categoryId: categoriaId || null,
            brandId: marcaId || null,
            collectionId: colecaoId || null,
            costPrice: custoNum,
            salePrice: precoNum,
            profitMargin: Number(margem.toFixed(2)),
            unit: unidade || 'UN',
            description: descricao ? String(descricao).slice(0, 2000) : null,
            photos: fotosDoCorpo(foto) ?? [],
            ...fiscaisDoCorpo(req.body),
            isActive: req.body.ativo === undefined ? true : Boolean(req.body.ativo),
            createdAt: new Date(),
            updatedAt: new Date()
        }
    });

    const variantesArr = Array.isArray(variantes) ? variantes : [];
    const temVariantes = variantesArr.length > 0;

    if (temVariantes) {
        for (const v of variantesArr) {
            const vPreco = v.preco !== undefined && v.preco !== null && v.preco !== '' ? Number(v.preco) : precoNum;
            const vCusto = v.custo !== undefined && v.custo !== null && v.custo !== '' ? Number(v.custo) : custoNum;
            if (!Number.isFinite(vPreco) || vPreco <= 0) {
                return res.status(400).json({ erro: "Preço de variante inválido!" });
            }
            if (!Number.isFinite(vCusto) || vCusto < 0) {
                return res.status(400).json({ erro: "Custo de variante inválido!" });
            }
            const idV = randomUUID();
            await prisma.productVariant.create({
                data: {
                    id: idV,
                    productId: produto.id,
                    color: v.cor ? String(v.cor).trim() : null,
                    size: v.tamanho ? String(v.tamanho).trim() : null,
                    sku: v.sku ? String(v.sku).trim() : null,
                    barcode: v.codigo ? String(v.codigo).trim() : null,
                    costPrice: vCusto,
                    salePrice: vPreco,
                    image: null
                }
            });
            const qtdV = Math.max(0, Number(v.estoque) || 0);
            await prisma.inventory.create({
                data: {
                    id: randomUUID(),
                    productId: produto.id,
                    variantId: idV,
                    branchId: filial.id,
                    quantity: qtdV,
                    minQuantity: 0,
                    maxQuantity: 0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });
        }
    }

    const qtdEstoque = Math.max(0, Number(estoque) || 0);
    await prisma.inventory.create({
        data: {
            id: randomUUID(),
            productId: produto.id,
            branchId: filial.id,
            quantity: temVariantes ? 0 : qtdEstoque,
            minQuantity: inteiroOuNull(minimo) ?? 0,
            maxQuantity: inteiroOuNull(maximo) ?? 0,
            createdAt: new Date(),
            updatedAt: new Date()
        }
    });

    return res.status(201).json({ id: produto.id, nome: produto.name });
});

// PUT /api/produtos/:id - Atualiza produto e/ou estoque
router.put('/:id', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { id } = req.params;
    const { nome, codigo, sku, preco, custo, categoriaId, marcaId, colecaoId, estoque, unidade, ativo, variantes, minimo, maximo, descricao, foto } = req.body;

    const produtoExistente = await prisma.product.findUnique({ where: { id } });
    if (!produtoExistente) {
        return res.status(404).json({ erro: "Produto não encontrado!" });
    }

    if (codigo && codigo !== produtoExistente.barcode) {
        const dup = await prisma.product.findFirst({ where: { barcode: codigo } });
        if (dup) {
            return res.status(400).json({ erro: "Código de barras já cadastrado!" });
        }
    }

    const precoNum = preco !== undefined ? Number(preco) : Number(produtoExistente.salePrice);
    if (!Number.isFinite(precoNum) || precoNum <= 0) {
        return res.status(400).json({ erro: "Preço de venda inválido!" });
    }

    let custoNum = Number(produtoExistente.costPrice);
    if (custo !== undefined && custo !== null && custo !== '') {
        custoNum = Number(custo);
        if (!Number.isFinite(custoNum) || custoNum < 0) {
            return res.status(400).json({ erro: "Custo inválido!" });
        }
    }

    const margem = precoNum > 0 ? ((precoNum - custoNum) / precoNum * 100) : 0;

    const produto = await prisma.product.update({
        where: { id },
        data: {
            name: nome !== undefined ? nome.trim().toUpperCase() : produtoExistente.name,
            barcode: codigo !== undefined ? (codigo || null) : produtoExistente.barcode,
            sku: sku !== undefined ? (sku || null) : produtoExistente.sku,
            categoryId: categoriaId !== undefined ? (categoriaId || null) : produtoExistente.categoryId,
            brandId: marcaId !== undefined ? (marcaId || null) : produtoExistente.brandId,
            collectionId: colecaoId !== undefined ? (colecaoId || null) : produtoExistente.collectionId,
            costPrice: custoNum,
            salePrice: precoNum,
            profitMargin: Number(margem.toFixed(2)),
            unit: unidade || produtoExistente.unit,
            isActive: ativo !== undefined ? Boolean(ativo) : produtoExistente.isActive,
            ...(descricao !== undefined ? { description: descricao ? String(descricao).slice(0, 2000) : null } : {}),
            ...(fotosDoCorpo(foto) !== undefined ? { photos: fotosDoCorpo(foto) } : {}),
            ...fiscaisDoCorpo(req.body),
            updatedAt: new Date()
        }
    });

    const filial = await prisma.branch.findFirst();
    if (!filial) {
        return res.status(400).json({ erro: "Empresa ou filial não configuradas!" });
    }

    // Variantes (grade): se informadas, substitui a grade atual
    if (Array.isArray(variantes) && variantes.length > 0) {
        const existentes = await prisma.productVariant.findMany({ where: { productId: id } });
        await prisma.productVariant.deleteMany({ where: { productId: id } });
        await prisma.inventory.deleteMany({ where: { productId: id, variantId: { not: null } } });

        for (const v of variantes) {
            const vPreco = v.preco !== undefined && v.preco !== null && v.preco !== '' ? Number(v.preco) : precoNum;
            const vCusto = v.custo !== undefined && v.custo !== null && v.custo !== '' ? Number(v.custo) : custoNum;
            if (!Number.isFinite(vPreco) || vPreco <= 0) {
                return res.status(400).json({ erro: "Preço de variante inválido!" });
            }
            if (!Number.isFinite(vCusto) || vCusto < 0) {
                return res.status(400).json({ erro: "Custo de variante inválido!" });
            }
            const idV = randomUUID();
            await prisma.productVariant.create({
                data: {
                    id: idV,
                    productId: id,
                    color: v.cor ? String(v.cor).trim() : null,
                    size: v.tamanho ? String(v.tamanho).trim() : null,
                    sku: v.sku ? String(v.sku).trim() : null,
                    barcode: v.codigo ? String(v.codigo).trim() : null,
                    costPrice: vCusto,
                    salePrice: vPreco,
                    image: null
                }
            });
            await prisma.inventory.create({
                data: {
                    id: randomUUID(),
                    productId: id,
                    variantId: idV,
                    branchId: filial.id,
                    quantity: Math.max(0, Number(v.estoque) || 0),
                    minQuantity: 0,
                    maxQuantity: 0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });
        }
        void existentes;
    }

    // Estoque mínimo/máximo ficam no registro de estoque do produto base
    if (minimo !== undefined || maximo !== undefined) {
        const base = await prisma.inventory.findFirst({ where: { productId: id, variantId: null, branchId: filial.id } });
        const dados: any = { updatedAt: new Date() };
        if (minimo !== undefined) dados.minQuantity = inteiroOuNull(minimo);
        if (maximo !== undefined) dados.maxQuantity = inteiroOuNull(maximo);
        if (base) {
            await prisma.inventory.update({ where: { id: base.id }, data: dados });
        } else {
            await prisma.inventory.create({
                data: { id: randomUUID(), productId: id, branchId: filial.id, quantity: 0, minQuantity: dados.minQuantity ?? 0, maxQuantity: dados.maxQuantity ?? 0, createdAt: new Date(), updatedAt: new Date() }
            });
        }
    }

    if (estoque !== undefined) {
        const inv = await prisma.inventory.findFirst({
            where: { productId: id, branchId: filial.id }
        });
        const qtd = Math.max(0, Number(estoque) || 0);
        if (inv) {
            await prisma.inventory.update({
                where: { id: inv.id },
                data: { quantity: qtd, updatedAt: new Date() }
            });
        } else {
            await prisma.inventory.create({
                data: {
                    id: randomUUID(),
                    productId: id,
                    branchId: filial.id,
                    quantity: qtd,
                    minQuantity: 0,
                    maxQuantity: 0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });
        }
    }

    return res.json({ id: produto.id, nome: produto.name });
});

// DELETE /api/produtos/:id - Exclui produto (e estoque em cascata)
router.delete('/:id', requerPermissao('ADMIN', 'MANAGER'), async (req: any, res: any) => {
    const { id } = req.params;

    const vendas = await prisma.saleItem.count({ where: { productId: id } });
    if (vendas > 0) {
        return res.status(400).json({ erro: "Não é possível excluir: produto possui vendas registradas!" });
    }

    await prisma.product.delete({ where: { id } });
    return res.json({ ok: true });
});

export default router;
