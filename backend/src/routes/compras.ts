import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { autenticar, requerPermissao } from '../middlewares/auth';
import { registrarAuditoria } from '../utils/auditoria';

const router = Router();
router.use(autenticar);

// GET /api/compras - Lista pedidos de compra
router.get('/', async (_req: any, res: any) => {
    const compras = await prisma.purchase.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
            Supplier: true,
            PurchaseItem: true
        }
    });

    return res.json(compras.map(c => ({
        id: c.id,
        numero: c.orderNumber,
        fornecedor: c.Supplier?.name ?? null,
        status: c.status,
        total: Number(c.total),
        qtdItens: c.PurchaseItem.length,
        data: c.createdAt,
        observacoes: c.notes
    })));
});

// GET /api/compras/:id - Detalhe do pedido com itens
router.get('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const compra = await prisma.purchase.findUnique({
        where: { id },
        include: {
            Supplier: true,
            PurchaseItem: { include: { Product: true } }
        }
    });

    if (!compra) {
        return res.status(404).json({ erro: "Compra não encontrada!" });
    }

    return res.json({
        id: compra.id,
        numero: compra.orderNumber,
        fornecedor: compra.Supplier ? { id: compra.Supplier.id, nome: compra.Supplier.name } : null,
        status: compra.status,
        total: Number(compra.total),
        observacoes: compra.notes,
        data: compra.createdAt,
        itens: compra.PurchaseItem.map(i => ({
            id: i.id,
            produtoId: i.productId,
            codigo: i.Product.barcode ?? i.Product.sku,
            nome: i.Product.name,
            quantidade: i.quantity,
            custoUnitario: Number(i.unitCost),
            total: Number(i.total)
        }))
    });
});

// POST /api/compras - Cria pedido de compra (PENDING)
router.post('/', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { fornecedorId, itens, observacoes, vencimento } = req.body;

    if (!fornecedorId) {
        return res.status(400).json({ erro: "Informe o fornecedor!" });
    }
    if (!itens || !Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ erro: "Informe pelo menos um item!" });
    }

    const empresa = await prisma.company.findUnique({ where: { id: req.operador.companyId } });
    const filial = req.operador.branchId
        ? await prisma.branch.findUnique({ where: { id: req.operador.branchId } })
        : await prisma.branch.findFirst({ where: { companyId: req.operador.companyId } });
    if (!empresa || !filial) {
        return res.status(400).json({ erro: "Empresa ou filial não configuradas!" });
    }

    let total = 0;
    const itensCompra: any[] = [];
    for (const item of itens) {
        const qtd = Math.round(Number(item.quantidade) || 0);
        const custo = Number(item.custoUnitario ?? 0);
        if (!item.produtoId || qtd <= 0 || custo <= 0) {
            return res.status(400).json({ erro: "Item inválido: informe produto, quantidade e custo unitário!" });
        }
        const valor = qtd * custo;
        total += valor;
        itensCompra.push({
            id: randomUUID(),
            productId: item.produtoId,
            quantity: qtd,
            unitCost: custo,
            total: valor
        });
    }

    const numero = String((await prisma.purchase.count()) + 1).padStart(6, '0');

    const compra = await prisma.purchase.create({
        data: {
            id: randomUUID(),
            companyId: empresa.id,
            branchId: filial.id,
            supplierId: fornecedorId,
            orderNumber: numero,
            status: 'PENDING',
            total,
            notes: observacoes || null,
            createdAt: new Date(),
            updatedAt: new Date(),
            PurchaseItem: { create: itensCompra }
        }
    });

    registrarAuditoria({
        userId: req.operador.id,
        action: 'COMPRA_CRIADA',
        entity: 'PURCHASE',
        entityId: compra.id,
        detail: { numero, total }
    });

    return res.status(201).json({ id: compra.id, numero, total });
});

// POST /api/compras/:id/receber - Recebe a mercadoria: entra no estoque e gera contas a pagar
router.post('/:id/receber', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { id } = req.params;
    const { vencimento, observacoes, recebidos } = req.body;

    try {
        const compra = await prisma.purchase.findUnique({
            where: { id },
            include: { PurchaseItem: true }
        });
        if (!compra) {
            return res.status(404).json({ erro: "Compra não encontrada!" });
        }
        if (compra.status === 'RECEIVED') {
            return res.status(400).json({ erro: "Compra já recebida!" });
        }

        const filial = await prisma.branch.findFirst();
        if (!filial) {
            return res.status(400).json({ erro: "Filial não configurada!" });
        }

        const operador = await prisma.user.findFirst({ where: { id: req.operador.id } });

        // Conferência: quantidade recebida por item (padrão = quantidade pedida)
        const qtdRecebida = (item: any) => {
            const v = recebidos && typeof recebidos === 'object' ? recebidos[item.id] : undefined;
            if (v === undefined || v === null || v === '') return item.quantity;
            return Math.max(0, Math.min(item.quantity, Math.round(Number(v) || 0)));
        };
        const totalRecebido = Number(compra.PurchaseItem.reduce((s, i) => s + qtdRecebida(i) * Number(i.unitCost), 0).toFixed(2));
        if (totalRecebido <= 0) {
            return res.status(400).json({ erro: "Nenhum item recebido! Informe as quantidades conferidas." });
        }
        const faltas = compra.PurchaseItem.filter(i => qtdRecebida(i) < i.quantity);

        await prisma.$transaction(async (tx) => {
            for (const item of compra.PurchaseItem) {
                const recebido = qtdRecebida(item);
                if (recebido <= 0) continue;
                let inv = await tx.inventory.findFirst({
                    where: { productId: item.productId, variantId: null, branchId: filial.id }
                });
                if (!inv) {
                    inv = await tx.inventory.create({
                        data: { id: randomUUID(), productId: item.productId, branchId: filial.id, quantity: 0, minQuantity: 0, maxQuantity: 0, createdAt: new Date(), updatedAt: new Date() }
                    });
                }
                if (inv) {
                    await tx.inventory.update({
                        where: { id: inv.id },
                        data: { quantity: inv.quantity + recebido, updatedAt: new Date() }
                    });
                    await tx.inventoryMovement.create({
                        data: {
                            id: randomUUID(),
                            inventoryId: inv.id,
                            type: 'IN',
                            quantity: recebido,
                            reason: `Recebimento compra ${compra.orderNumber}`,
                            userId: operador?.id ?? null,
                            createdAt: new Date()
                        }
                    });
                }
            }

            const dueDate = vencimento ? new Date(`${vencimento}T00:00:00`) : new Date(Date.now() + 30 * 86400000);

            await tx.financialTransaction.create({
                data: {
                    id: randomUUID(),
                    companyId: compra.companyId,
                    type: 'PAY',
                    status: 'PENDING',
                    description: `COMPRA - Nº ${compra.orderNumber}`,
                    amount: totalRecebido,
                    dueDate,
                    category: 'COMPRA',
                    supplierId: compra.supplierId ?? null,
                    purchaseId: compra.id,
                    notes: [observacoes, faltas.length ? `Recebimento parcial: ${faltas.length} item(ns) com falta` : ''].filter(Boolean).join(' · ') || null,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });

            await tx.purchase.update({
                where: { id: compra.id },
                data: { status: 'RECEIVED', updatedAt: new Date() }
            });
        });

        registrarAuditoria({
            userId: req.operador.id,
            action: 'COMPRA_RECEBIDA',
            entity: 'PURCHASE',
            entityId: compra.id,
            detail: { numero: compra.orderNumber, total: Number(compra.total), totalRecebido, itensComFalta: faltas.length }
        });

        return res.json({ ok: true, status: 'RECEIVED', totalRecebido, itensComFalta: faltas.length });
    } catch (e: any) {
        return res.status(400).json({ erro: e.message });
    }
});

// DELETE /api/compras/:id - Cancela pedido de compra ainda não recebido
router.delete('/:id', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { id } = req.params;
    const compra = await prisma.purchase.findUnique({ where: { id } });
    if (!compra) {
        return res.status(404).json({ erro: "Compra não encontrada!" });
    }
    if (compra.status === 'RECEIVED') {
        return res.status(400).json({ erro: "Compra recebida não pode ser cancelada!" });
    }

    await prisma.purchase.delete({ where: { id } });
    registrarAuditoria({
        userId: req.operador.id,
        action: 'COMPRA_CANCELADA',
        entity: 'PURCHASE',
        entityId: id,
        detail: { numero: compra.orderNumber }
    });
    return res.json({ ok: true });
});

export default router;
