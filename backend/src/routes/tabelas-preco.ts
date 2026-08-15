import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';

const router = Router();

// GET /api/tabelas-preco - Lista tabelas de preço com totais de itens/clientes
router.get('/', async (_req: any, res: any) => {
    const tabelas = await prisma.priceTable.findMany({
        include: {
            _count: { select: { Item: true, Customer: true } }
        },
        orderBy: { createdAt: 'asc' }
    });

    return res.json(tabelas.map(t => ({
        id: t.id,
        nome: t.name,
        padrao: t.isDefault,
        ativa: t.isActive,
        itens: t._count.Item,
        clientes: t._count.Customer,
        criadoEm: t.createdAt
    })));
});

// POST /api/tabelas-preco - Cria tabela (apenas uma pode ser padrão)
router.post('/', async (req: any, res: any) => {
    const { nome, padrao, ativa } = req.body;

    if (!nome || !String(nome).trim()) {
        return res.status(400).json({ erro: "Informe o nome da tabela!" });
    }

    const empresa = await prisma.company.findFirst();
    if (!empresa) {
        return res.status(400).json({ erro: "Empresa não configurada!" });
    }

    const isPadrao = Boolean(padrao);
    const tabela = await prisma.$transaction(async (tx) => {
        if (isPadrao) {
            await tx.priceTable.updateMany({
                where: { isDefault: true },
                data: { isDefault: false, updatedAt: new Date() }
            });
        }
        return tx.priceTable.create({
            data: {
                id: randomUUID(),
                companyId: empresa.id,
                name: String(nome).trim().toUpperCase(),
                isDefault: isPadrao,
                isActive: ativa !== undefined ? Boolean(ativa) : true,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });
    });

    return res.status(201).json({ id: tabela.id, nome: tabela.name });
});

// GET /api/tabelas-preco/:id - Detalhe com itens e clientes vinculados
router.get('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const tabela = await prisma.priceTable.findUnique({
        where: { id },
        include: {
            Item: { include: { Product: true } },
            Customer: { select: { id: true, name: true, cellphone: true } }
        }
    });

    if (!tabela) {
        return res.status(404).json({ erro: "Tabela não encontrada!" });
    }

    return res.json({
        id: tabela.id,
        nome: tabela.name,
        padrao: tabela.isDefault,
        ativa: tabela.isActive,
        clientes: tabela.Customer,
        itens: tabela.Item.map(i => ({
            id: i.id,
            produtoId: i.productId,
            produto: i.Product.name,
            codigo: i.Product.barcode ?? i.Product.sku,
            varianteId: i.variantId,
            minQtd: i.minQuantity,
            preco: i.price !== null ? Number(i.price) : null,
            percentual: i.percentAdjust !== null ? Number(i.percentAdjust) : null
        }))
    });
});

// PUT /api/tabelas-preco/:id - Renomeia / marca como padrão / ativa-desativa
router.put('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const { nome, padrao, ativa } = req.body;

    const tabela = await prisma.priceTable.findUnique({ where: { id } });
    if (!tabela) {
        return res.status(404).json({ erro: "Tabela não encontrada!" });
    }

    const isPadrao = padrao !== undefined ? Boolean(padrao) : tabela.isDefault;
    const atualizada = await prisma.$transaction(async (tx) => {
        if (isPadrao && !tabela.isDefault) {
            await tx.priceTable.updateMany({
                where: { isDefault: true },
                data: { isDefault: false, updatedAt: new Date() }
            });
        }
        return tx.priceTable.update({
            where: { id },
            data: {
                name: nome !== undefined ? String(nome).trim().toUpperCase() : tabela.name,
                isDefault: isPadrao,
                isActive: ativa !== undefined ? Boolean(ativa) : tabela.isActive,
                updatedAt: new Date()
            }
        });
    });

    return res.json({ id: atualizada.id, nome: atualizada.name });
});

// DELETE /api/tabelas-preco/:id - Exclui tabela (bloqueia se houver clientes vinculados)
router.delete('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const clientes = await prisma.customer.count({ where: { priceTableId: id } });
    if (clientes > 0) {
        return res.status(400).json({ erro: "Não é possível excluir: há clientes vinculados a esta tabela!" });
    }
    await prisma.priceTable.delete({ where: { id } });
    return res.json({ ok: true });
});

// POST /api/tabelas-preco/:id/itens - Cria ou atualiza um item da tabela
router.post('/:id/itens', async (req: any, res: any) => {
    const { id } = req.params;
    const { produtoId, varianteId, minQtd, preco, percentual } = req.body;

    const tabela = await prisma.priceTable.findUnique({ where: { id } });
    if (!tabela) {
        return res.status(404).json({ erro: "Tabela não encontrada!" });
    }
    const prod = await prisma.product.findUnique({ where: { id: produtoId } });
    if (!prod) {
        return res.status(404).json({ erro: "Produto não encontrado!" });
    }

    const precoNum = preco !== undefined && preco !== null && preco !== '' ? Number(preco) : null;
    const pctNum = percentual !== undefined && percentual !== null && percentual !== '' ? Number(percentual) : null;
    if (precoNum === null && pctNum === null) {
        return res.status(400).json({ erro: "Informe o preço fixo ou o percentual de ajuste!" });
    }
    if (precoNum !== null && precoNum <= 0) {
        return res.status(400).json({ erro: "Preço fixo deve ser maior que zero!" });
    }

    const existente = await prisma.priceTableItem.findFirst({
        where: {
            priceTableId: id,
            productId: produtoId,
            variantId: varianteId || null
        }
    });

    const dados = {
        minQuantity: minQtd !== undefined && minQtd !== null && minQtd !== ''
            ? Math.max(0, Number(minQtd))
            : existente?.minQuantity ?? null,
        price: precoNum,
        percentAdjust: pctNum
    };

    let item;
    if (existente) {
        item = await prisma.priceTableItem.update({ where: { id: existente.id }, data: dados });
    } else {
        item = await prisma.priceTableItem.create({
            data: {
                id: randomUUID(),
                priceTableId: id,
                productId: produtoId,
                variantId: varianteId || null,
                ...dados
            }
        });
    }

    return res.json({ id: item.id });
});

// DELETE /api/tabelas-preco/:id/itens/:itemId - Remove um item da tabela
router.delete('/:id/itens/:itemId', async (req: any, res: any) => {
    await prisma.priceTableItem.delete({ where: { id: req.params.itemId } });
    return res.json({ ok: true });
});

export default router;
