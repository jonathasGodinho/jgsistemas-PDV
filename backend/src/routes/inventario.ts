import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { autenticar, requerPermissao } from '../middlewares/auth';
import { registrarAuditoria } from '../utils/auditoria';

const router = Router();
router.use(autenticar, requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'STOCKIST'));

// GET /api/inventario - Lista contagens de estoque
router.get('/', async (_req: any, res: any) => {
    const contagens = await prisma.inventoryCount.findMany({
        include: { Item: true },
        orderBy: { createdAt: 'desc' }
    });

    return res.json(contagens.map(c => {
        const itens = c.Item;
        const comDivergencia = itens.filter(i => i.countedQuantity !== null && i.countedQuantity !== i.expectedQuantity).length;
        return {
            id: c.id,
            nome: c.name,
            status: c.status,
            criadoEm: c.createdAt,
            fechadoEm: c.closedAt,
            totalItens: itens.length,
            conferidos: itens.filter(i => i.countedQuantity !== null).length,
            divergencias: comDivergencia
        };
    }));
});

// POST /api/inventario - Abre contagem com o espelho atual do estoque
router.post('/', async (req: any, res: any) => {
    const { nome } = req.body;

    const filial = await prisma.branch.findFirst();
    if (!filial) {
        return res.status(400).json({ erro: "Filial não configurada!" });
    }

    const emAberto = await prisma.inventoryCount.findFirst({ where: { status: 'OPEN' } });
    if (emAberto) {
        return res.status(400).json({ erro: "Já existe uma contagem em aberto! Finalize-a antes de abrir outra." });
    }

    const estoques = await prisma.inventory.findMany({
        where: { branchId: filial.id },
        include: { Product: true }
    });

    if (estoques.length === 0) {
        return res.status(400).json({ erro: "Nenhum estoque cadastrado para contagem!" });
    }

    const contagem = await prisma.$transaction(async (tx) => {
        const c = await tx.inventoryCount.create({
            data: {
                id: randomUUID(),
                companyId: filial.companyId,
                branchId: filial.id,
                name: nome ? String(nome).trim() : `CONTAGEM ${new Date().toLocaleDateString('pt-BR')}`,
                status: 'OPEN',
                createdAt: new Date()
            }
        });

        await tx.inventoryCountItem.createMany({
            data: estoques.map(e => ({
                id: randomUUID(),
                countId: c.id,
                inventoryId: e.id,
                expectedQuantity: e.quantity,
                countedQuantity: null
            }))
        });

        return c;
    });

    registrarAuditoria({
        userId: req.operador.id,
        action: 'CONTAGEM_ABERTA',
        entity: 'INVENTORY_COUNT',
        entityId: contagem.id,
        detail: { nome: contagem.name, itens: estoques.length }
    });

    return res.status(201).json({ id: contagem.id, nome: contagem.name, itens: estoques.length });
});

// GET /api/inventario/:id - Detalhe da contagem com produtos e divergências
router.get('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const contagem = await prisma.inventoryCount.findUnique({
        where: { id },
        include: {
            Item: {
                include: {
                    Inventory: {
                        include: { Product: true, ProductVariant: true }
                    }
                },
                orderBy: { id: 'asc' }
            }
        }
    });

    if (!contagem) {
        return res.status(404).json({ erro: "Contagem não encontrada!" });
    }

    return res.json({
        id: contagem.id,
        nome: contagem.name,
        status: contagem.status,
        criadoEm: contagem.createdAt,
        fechadoEm: contagem.closedAt,
        itens: contagem.Item.map(i => {
            const inv = i.Inventory;
            const descricao = `${inv.Product.name}${inv.ProductVariant ? ` - ${inv.ProductVariant.color ?? ''} ${inv.ProductVariant.size ?? ''}`.trimEnd() : ''}`;
            const diff = i.countedQuantity !== null ? i.countedQuantity - i.expectedQuantity : null;
            return {
                id: i.id,
                inventoryId: i.inventoryId,
                produto: descricao,
                codigo: inv.ProductVariant?.barcode ?? inv.Product.sku ?? inv.Product.barcode,
                esperado: i.expectedQuantity,
                contado: i.countedQuantity,
                divergencia: diff
            };
        })
    });
});

// POST /api/inventario/:id/contagem - Lança a quantidade contada de um item
router.post('/:id/contagem', async (req: any, res: any) => {
    const { id } = req.params;
    const { inventoryId, quantidade } = req.body;

    const contagem = await prisma.inventoryCount.findUnique({
        where: { id },
        include: { Item: true }
    });
    if (!contagem) {
        return res.status(404).json({ erro: "Contagem não encontrada!" });
    }
    if (contagem.status !== 'OPEN') {
        return res.status(400).json({ erro: "Contagem já foi finalizada!" });
    }

    const item = contagem.Item.find(i => i.inventoryId === inventoryId);
    if (!item) {
        return res.status(404).json({ erro: "Item não pertence a esta contagem!" });
    }

    const qtd = Math.max(0, Math.round(Number(quantidade) || 0));
    const atualizado = await prisma.inventoryCountItem.update({
        where: { id: item.id },
        data: { countedQuantity: qtd }
    });

    return res.json({ id: atualizado.id, contado: qtd });
});

// POST /api/inventario/:id/finalizar - Aplica as divergências e encerra a contagem
router.post('/:id/finalizar', async (req: any, res: any) => {
    const { id } = req.params;

    const contagem = await prisma.inventoryCount.findUnique({
        where: { id },
        include: { Item: true }
    });
    if (!contagem) {
        return res.status(404).json({ erro: "Contagem não encontrada!" });
    }
    if (contagem.status !== 'OPEN') {
        return res.status(400).json({ erro: "Contagem já foi finalizada!" });
    }

    const filial = await prisma.branch.findFirst();
    if (!filial) {
        return res.status(400).json({ erro: "Filial não configurada!" });
    }

    const ajustes: { item: any; delta: number }[] = [];
    for (const item of contagem.Item) {
        if (item.countedQuantity === null) continue;
        const delta = item.countedQuantity - item.expectedQuantity;
        if (delta !== 0) {
            ajustes.push({ item, delta });
        }
    }

    const result = await prisma.$transaction(async (tx) => {
        for (const a of ajustes) {
            const inv = await tx.inventory.findUnique({ where: { id: a.item.inventoryId } });
            if (!inv) continue;
            await tx.inventory.update({
                where: { id: inv.id },
                data: { quantity: a.item.countedQuantity, updatedAt: new Date() }
            });
            await tx.inventoryMovement.create({
                data: {
                    id: randomUUID(),
                    inventoryId: inv.id,
                    type: 'ADJUSTMENT',
                    quantity: a.delta,
                    reason: `Contagem de inventário ${contagem.name}`,
                    userId: req.operador.id,
                    createdAt: new Date()
                }
            });
        }

        return tx.inventoryCount.update({
            where: { id },
            data: {
                status: 'CLOSED',
                closedAt: new Date(),
                closedById: req.operador.id
            }
        });
    });

    registrarAuditoria({
        userId: req.operador.id,
        action: 'CONTAGEM_FINALIZADA',
        entity: 'INVENTORY_COUNT',
        entityId: contagem.id,
        detail: { nome: contagem.name, ajustes: ajustes.length }
    });

    return res.json({ ok: true, status: 'CLOSED', ajustes: ajustes.length });
});

// DELETE /api/inventario/:id - Cancela uma contagem em aberto
router.delete('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const contagem = await prisma.inventoryCount.findUnique({ where: { id } });
    if (!contagem) {
        return res.status(404).json({ erro: "Contagem não encontrada!" });
    }
    if (contagem.status !== 'OPEN') {
        return res.status(400).json({ erro: "Contagem finalizada não pode ser excluída!" });
    }

    await prisma.inventoryCount.delete({ where: { id } });
    return res.json({ ok: true });
});

export default router;
