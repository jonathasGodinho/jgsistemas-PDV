import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { requerPermissao } from '../middlewares/auth';

const router = Router();

// GET /api/estoque - Posição de estoque dos produtos (com situação)
router.get('/', async (req: any, res: any) => {
    const { busca, baixo } = req.query;

    const where: any = {};
    if (busca) {
        where.OR = [
            { name: { contains: String(busca), mode: 'insensitive' } },
            { barcode: { contains: String(busca) } },
            { sku: { contains: String(busca), mode: 'insensitive' } }
        ];
    }

    const produtos = await prisma.product.findMany({
        where,
        include: {
            ProductVariant: true,
            Inventory: { include: { ProductVariant: true } }
        },
        orderBy: { name: 'asc' }
    });

    let resultado: any[] = [];
    for (const p of produtos) {
        // Linha principal (estoque base)
        const base = p.Inventory.filter(i => !i.variantId);
        const quantidade = base.reduce((s, i) => s + i.quantity, 0);
        const minimo = base.reduce((s, i) => s + i.minQuantity, 0);
        const maximo = base.reduce((s, i) => s + (i.maxQuantity ?? 0), 0);

        let situacao = 'OK';
        if (quantidade <= 0) situacao = 'SEM_ESTOQUE';
        else if (quantidade <= minimo) situacao = 'BAIXO';

        resultado.push({
            id: p.id,
            nome: p.name,
            codigo: p.barcode,
            sku: p.sku,
            quantidade,
            minimo,
            maximo,
            situacao,
            grade: null
        });

        // Linhas de variantes (grade cor/tamanho)
        for (const v of p.ProductVariant) {
            const invs = p.Inventory.filter(i => i.variantId === v.id);
            const qtdV = invs.reduce((s, i) => s + i.quantity, 0);
            const minV = invs.reduce((s, i) => s + i.minQuantity, 0);

            let situacaoV = 'OK';
            if (qtdV <= 0) situacaoV = 'SEM_ESTOQUE';
            else if (qtdV <= minV) situacaoV = 'BAIXO';

            resultado.push({
                id: p.id,
                nome: p.name,
                codigo: v.barcode ?? v.sku ?? p.barcode,
                sku: v.sku,
                quantidade: qtdV,
                minimo: minV,
                maximo: invs.reduce((s, i) => s + (i.maxQuantity ?? 0), 0),
                situacao: situacaoV,
                grade: `${v.color ? v.color : ''}${v.size ? ' ' + v.size : ''}`.trim() || 'VARIANTE'
            });
        }
    }

    if (baixo === 'true') {
        resultado = resultado.filter(p => p.situacao !== 'OK');
    }

    return res.json(resultado);
});

// GET /api/estoque/movimentacoes - Histórico de movimentações
router.get('/movimentacoes', async (_req: any, res: any) => {
    const movs = await prisma.inventoryMovement.findMany({
        include: {
            Inventory: { include: { Product: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 100
    });

    return res.json(movs.map(m => ({
        id: m.id,
        tipo: m.type,
        quantidade: m.quantity,
        motivo: m.reason,
        produto: m.Inventory.Product.name,
        data: m.createdAt
    })));
});

// POST /api/estoque/entrada - Entrada manual de estoque
router.post('/entrada', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'STOCKIST'), async (req: any, res: any) => {
    const { produtoId, quantidade, motivo } = req.body;
    const qtd = Math.round(Number(quantidade) || 0);

    if (!produtoId || qtd <= 0) {
        return res.status(400).json({ erro: "Informe o produto e uma quantidade válida!" });
    }

    const filial = await prisma.branch.findFirst();
    if (!filial) {
        return res.status(400).json({ erro: "Filial não configurada!" });
    }

    const inv = await prisma.inventory.findFirst({
        where: { productId: produtoId, branchId: filial.id }
    });
    if (!inv) {
        return res.status(400).json({ erro: "Produto sem estoque cadastrado!" });
    }

    await prisma.inventory.update({
        where: { id: inv.id },
        data: { quantity: inv.quantity + qtd, updatedAt: new Date() }
    });

    await prisma.inventoryMovement.create({
        data: {
            id: randomUUID(),
            inventoryId: inv.id,
            type: 'IN',
            quantity: qtd,
            reason: motivo || 'ENTRADA MANUAL',
            userId: req.operador?.id ?? null,
            createdAt: new Date()
        }
    });

    return res.json({ ok: true, novaQuantidade: inv.quantity + qtd });
});

// POST /api/estoque/saida - Saída manual de estoque
router.post('/saida', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'STOCKIST'), async (req: any, res: any) => {
    const { produtoId, quantidade, motivo } = req.body;
    const qtd = Math.round(Number(quantidade) || 0);

    if (!produtoId || qtd <= 0) {
        return res.status(400).json({ erro: "Informe o produto e uma quantidade válida!" });
    }

    const filial = await prisma.branch.findFirst();
    if (!filial) {
        return res.status(400).json({ erro: "Filial não configurada!" });
    }

    const inv = await prisma.inventory.findFirst({
        where: { productId: produtoId, branchId: filial.id }
    });
    if (!inv) {
        return res.status(400).json({ erro: "Produto sem estoque cadastrado!" });
    }

    if (inv.quantity < qtd) {
        return res.status(400).json({ erro: "Estoque insuficiente para a saída!" });
    }

    await prisma.inventory.update({
        where: { id: inv.id },
        data: { quantity: inv.quantity - qtd, updatedAt: new Date() }
    });

    await prisma.inventoryMovement.create({
        data: {
            id: randomUUID(),
            inventoryId: inv.id,
            type: 'OUT',
            quantity: -qtd,
            reason: motivo || 'SAIDA MANUAL',
            userId: req.operador?.id ?? null,
            createdAt: new Date()
        }
    });

    return res.json({ ok: true, novaQuantidade: inv.quantity - qtd });
});

// POST /api/estoque/ajuste - Ajusta estoque para um valor específico
router.post('/ajuste', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'STOCKIST'), async (req: any, res: any) => {
    const { produtoId, quantidade, motivo } = req.body;
    const novaQtd = Math.round(Number(quantidade) || 0);

    if (!produtoId || novaQtd < 0) {
        return res.status(400).json({ erro: "Informe o produto e uma quantidade válida!" });
    }

    const filial = await prisma.branch.findFirst();
    if (!filial) {
        return res.status(400).json({ erro: "Filial não configurada!" });
    }

    const inv = await prisma.inventory.findFirst({
        where: { productId: produtoId, branchId: filial.id }
    });
    if (!inv) {
        return res.status(400).json({ erro: "Produto sem estoque cadastrado!" });
    }

    const delta = novaQtd - inv.quantity;

    await prisma.inventory.update({
        where: { id: inv.id },
        data: { quantity: novaQtd, updatedAt: new Date() }
    });

    await prisma.inventoryMovement.create({
        data: {
            id: randomUUID(),
            inventoryId: inv.id,
            type: 'ADJUSTMENT',
            quantity: delta,
            reason: motivo || 'AJUSTE DE INVENTÁRIO',
            userId: req.operador?.id ?? null,
            createdAt: new Date()
        }
    });

    return res.json({ ok: true, novaQuantidade: novaQtd });
});

export default router;
