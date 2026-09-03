import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { calcularPromocoes } from '../utils/promocoes';
import { registrarAuditoria } from '../utils/auditoria';
import { requerPermissao } from '../middlewares/auth';

const router = Router();

const TIPOS = ['LEVE_PAGUE', 'BRINDE', 'DESCONTO_PROGRESSIVO', 'DESCONTO_VALOR', 'DESCONTO_PERCENTUAL'];
const ESCOPOS = ['PRODUCT', 'CATEGORY', 'BRAND', 'ALL'];

const validarValoresPromocao = (body: any): string | null => {
    const { discountValue, discountPercent } = body;
    if (discountValue !== undefined && discountValue !== null && discountValue !== '') {
        const v = Number(discountValue);
        if (!Number.isFinite(v)) return 'Valor de desconto inválido!';
        if (v < 0) return 'O desconto em valor não pode ser negativo!';
    }
    if (discountPercent !== undefined && discountPercent !== null && discountPercent !== '') {
        const p = Number(discountPercent);
        if (!Number.isFinite(p)) return 'Percentual de desconto inválido!';
        if (p < 0 || p > 90) return 'Percentual de desconto deve estar entre 0 e 90!';
    }
    return null;
};

// GET /api/promocoes - Lista promoções (com situação atual de validade)
router.get('/', async (_req: any, res: any) => {
    const promos = await prisma.promotion.findMany({
        include: { _count: { select: { PromotionProduct: true } } },
        orderBy: { createdAt: 'desc' }
    });

    const agora = new Date();
    return res.json(promos.map(p => ({
        id: p.id,
        nome: p.name,
        tipo: p.type,
        escopo: p.scopeType,
        ativa: p.isActive && p.startDate <= agora && (!p.endDate || p.endDate >= agora),
        pausada: !p.isActive,
        startDate: p.startDate,
        endDate: p.endDate,
        produtos: p._count.PromotionProduct
    })));
});

// POST /api/promocoes - Cria promoção com regras e alvos
router.post('/', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { nome, tipo, escopo, produtos, categorias, marcas, buyQuantity, payQuantity, freeQuantity, discountValue, discountPercent, minQuantity, startDate, endDate, ativa } = req.body;

    if (!nome || !String(nome).trim()) {
        return res.status(400).json({ erro: "Informe o nome da promoção!" });
    }
    if (!tipo || !TIPOS.includes(tipo)) {
        return res.status(400).json({ erro: "Tipo de promoção inválido!" });
    }
    if (escopo && !ESCOPOS.includes(escopo)) {
        return res.status(400).json({ erro: "Escopo de promoção inválido!" });
    }
    const erroValores = validarValoresPromocao(req.body);
    if (erroValores) {
        return res.status(400).json({ erro: erroValores });
    }

    const empresa = await prisma.company.findUnique({ where: { id: req.operador.companyId } });
    if (!empresa) {
        return res.status(400).json({ erro: "Empresa não configurada!" });
    }

    const inicio = new Date(startDate || new Date());
    const fim = endDate ? new Date(endDate) : null;
    if (fim && fim < inicio) {
        return res.status(400).json({ erro: "A data final deve ser posterior à data inicial!" });
    }

    const produtoIds = Array.isArray(produtos) ? produtos : [];

    const promocao = await prisma.$transaction(async (tx) => {
        const p = await tx.promotion.create({
            data: {
                id: randomUUID(),
                companyId: empresa.id,
                name: String(nome).trim().toUpperCase(),
                type: tipo,
                scopeType: escopo || 'PRODUCT',
                targetCategoryIds: Array.isArray(categorias) ? categorias : [],
                targetBrandIds: Array.isArray(marcas) ? marcas : [],
                buyQuantity: buyQuantity !== undefined && buyQuantity !== null && buyQuantity !== '' ? Math.max(1, Number(buyQuantity)) : null,
                payQuantity: payQuantity !== undefined && payQuantity !== null && payQuantity !== '' ? Math.max(1, Number(payQuantity)) : null,
                freeQuantity: freeQuantity !== undefined && freeQuantity !== null && freeQuantity !== '' ? Math.max(1, Number(freeQuantity)) : null,
                discountValue: discountValue !== undefined && discountValue !== null && discountValue !== '' ? Number(discountValue) : null,
                discountPercent: discountPercent !== undefined && discountPercent !== null && discountPercent !== '' ? Number(discountPercent) : null,
                minQuantity: minQuantity !== undefined && minQuantity !== null && minQuantity !== '' ? Math.max(1, Number(minQuantity)) : 1,
                startDate: inicio,
                endDate: fim,
                isActive: ativa !== undefined ? Boolean(ativa) : true,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });

        if (produtoIds.length > 0) {
            await tx.promotionProduct.createMany({
                data: produtoIds.map((pid: string) => ({
                    id: randomUUID(),
                    promotionId: p.id,
                    productId: pid,
                    variantId: null
                }))
            });
        }
        return p;
    });

    registrarAuditoria({
        userId: req.operador?.id,
        action: 'PROMOCAO_CRIADA',
        entity: 'PROMOTION',
        entityId: promocao.id,
        detail: { nome: promocao.name, tipo }
    });

    return res.status(201).json({ id: promocao.id, nome: promocao.name });
});

// GET /api/promocoes/:id - Detalhe da promoção
router.get('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const p = await prisma.promotion.findUnique({
        where: { id },
        include: { PromotionProduct: { include: { Product: true } } }
    });

    if (!p) {
        return res.status(404).json({ erro: "Promoção não encontrada!" });
    }

    return res.json({
        id: p.id,
        nome: p.name,
        tipo: p.type,
        escopo: p.scopeType,
        categorias: p.targetCategoryIds,
        marcas: p.targetBrandIds,
        buyQuantity: p.buyQuantity,
        payQuantity: p.payQuantity,
        freeQuantity: p.freeQuantity,
        discountValue: p.discountValue !== null ? Number(p.discountValue) : null,
        discountPercent: p.discountPercent !== null ? Number(p.discountPercent) : null,
        minQuantity: p.minQuantity,
        startDate: p.startDate,
        endDate: p.endDate,
        ativa: p.isActive,
        produtos: p.PromotionProduct.map(pp => ({
            id: pp.id,
            produtoId: pp.productId,
            nome: pp.Product.name
        }))
    });
});

// PUT /api/promocoes/:id - Atualiza promoção (substitui produtos-alvo se informados)
router.put('/:id', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { id } = req.params;
    const body = req.body;

    const p = await prisma.promotion.findUnique({ where: { id } });
    if (!p) {
        return res.status(404).json({ erro: "Promoção não encontrada!" });
    }
    const erroValores = validarValoresPromocao(body);
    if (erroValores) {
        return res.status(400).json({ erro: erroValores });
    }

    const numOrNull = (v: any) => (v !== undefined && v !== null && v !== '' ? Number(v) : null);

    const promocao = await prisma.$transaction(async (tx) => {
        const atual = await tx.promotion.update({
            where: { id },
            data: {
                name: body.nome !== undefined ? String(body.nome).trim().toUpperCase() : p.name,
                type: body.tipo ?? p.type,
                scopeType: body.escopo ?? p.scopeType,
                targetCategoryIds: body.categorias !== undefined ? body.categorias : p.targetCategoryIds,
                targetBrandIds: body.marcas !== undefined ? body.marcas : p.targetBrandIds,
                buyQuantity: body.buyQuantity !== undefined ? numOrNull(body.buyQuantity) : p.buyQuantity,
                payQuantity: body.payQuantity !== undefined ? numOrNull(body.payQuantity) : p.payQuantity,
                freeQuantity: body.freeQuantity !== undefined ? numOrNull(body.freeQuantity) : p.freeQuantity,
                discountValue: body.discountValue !== undefined ? numOrNull(body.discountValue) : p.discountValue,
                discountPercent: body.discountPercent !== undefined ? numOrNull(body.discountPercent) : p.discountPercent,
                minQuantity: body.minQuantity !== undefined && body.minQuantity !== null && body.minQuantity !== ''
                    ? Math.max(1, Number(body.minQuantity))
                    : p.minQuantity,
                startDate: body.startDate ? new Date(body.startDate) : p.startDate,
                endDate: body.endDate ? new Date(body.endDate) : p.endDate,
                isActive: body.ativa !== undefined ? Boolean(body.ativa) : p.isActive,
                updatedAt: new Date()
            }
        });

        if (Array.isArray(body.produtos)) {
            await tx.promotionProduct.deleteMany({ where: { promotionId: id } });
            if (body.produtos.length > 0) {
                await tx.promotionProduct.createMany({
                    data: body.produtos.map((pid: string) => ({
                        id: randomUUID(),
                        promotionId: id,
                        productId: pid,
                        variantId: null
                    }))
                });
            }
        }
        return atual;
    });

    registrarAuditoria({
        userId: req.operador?.id,
        action: 'PROMOCAO_ATUALIZADA',
        entity: 'PROMOTION',
        entityId: promocao.id,
        detail: { nome: promocao.name }
    });

    return res.json({ id: promocao.id, nome: promocao.name });
});

// DELETE /api/promocoes/:id
router.delete('/:id', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    await prisma.promotion.delete({ where: { id: req.params.id } });

    registrarAuditoria({
        userId: req.operador?.id,
        action: 'PROMOCAO_EXCLUIDA',
        entity: 'PROMOTION',
        entityId: req.params.id
    });

    return res.json({ ok: true });
});

// POST /api/promocoes/aplicar - Calcula descontos de promoção sobre o carrinho
router.post('/aplicar', async (req: any, res: any) => {
    const { itens } = req.body;

    if (!itens || !Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ erro: "Nenhum item no carrinho!" });
    }

    const resultado = await calcularPromocoes(itens.map((i: any) => ({
        produtoId: i.produtoId ?? i.id,
        variantId: i.variantId ?? null,
        quantidade: Number(i.quantidade ?? 1),
        precoUnit: Number(i.precoUnit ?? i.preco ?? 0)
    })));

    return res.json(resultado);
});

export default router;
