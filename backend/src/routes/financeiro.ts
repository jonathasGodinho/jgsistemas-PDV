import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { requerPermissao } from '../middlewares/auth';

const router = Router();

const parseData = (v: any) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};

// GET /api/financeiro/resumo - Indicadores financeiros + caixa atual
router.get('/resumo', async (_req: any, res: any) => {
    const agora = new Date();
    const inicioHoje = new Date(agora);
    inicioHoje.setHours(0, 0, 0, 0);
    const fimHoje = new Date(inicioHoje);
    fimHoje.setDate(fimHoje.getDate() + 1);

    const vendasHoje = await prisma.sale.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: inicioHoje, lt: fimHoje } },
        include: { SalePayment: true }
    });

    const porMetodo: Record<string, number> = {};
    let totalVendas = 0;
    for (const v of vendasHoje) {
        totalVendas += Number(v.total);
        for (const p of v.SalePayment) {
            const m = p.method;
            porMetodo[m] = (porMetodo[m] ?? 0) + Number(p.amount);
        }
    }

    const contas = await prisma.financialTransaction.findMany({
        where: { status: { in: ['PENDING', 'OVERDUE'] } },
        orderBy: { dueDate: 'asc' }
    });

    const receber = contas.filter(c => c.type === 'RECEIVE');
    const pagar = contas.filter(c => c.type === 'PAY');

    const caixa = await prisma.cashRegister.findFirst({
        where: { status: 'OPEN' },
        orderBy: { openedAt: 'desc' }
    });

    return res.json({
        vendasHoje: {
            total: Number(totalVendas.toFixed(2)),
            quantidade: vendasHoje.length,
            porMetodo: Object.fromEntries(
                Object.entries(porMetodo).map(([k, v]) => [k, Number(v.toFixed(2))])
            )
        },
        receber: {
            total: Number(receber.reduce((s, c) => s + Number(c.amount), 0).toFixed(2)),
            vencidas: Number(receber.filter(c => c.dueDate < inicioHoje).reduce((s, c) => s + Number(c.amount), 0).toFixed(2)),
            quantidade: receber.length
        },
        pagar: {
            total: Number(pagar.reduce((s, c) => s + Number(c.amount), 0).toFixed(2)),
            vencidas: Number(pagar.filter(c => c.dueDate < inicioHoje).reduce((s, c) => s + Number(c.amount), 0).toFixed(2)),
            quantidade: pagar.length
        },
        caixa: caixa ? {
            id: caixa.id,
            abertura: Number(caixa.openingBalance),
            vendas: Number(caixa.totalSales ?? 0),
            entradas: Number(caixa.totalPayments ?? 0),
            saidas: Number(caixa.totalWithdrawals ?? 0),
            abertoEm: caixa.openedAt
        } : null
    });
});

const listarContas = async (tipo: string, status?: string) => {
    const where: any = { type: tipo };
    if (status && ['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'].includes(status)) {
        where.status = status;
    }
    const contas = await prisma.financialTransaction.findMany({
        where,
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        include: { Supplier: true }
    });
    // Cliente das contas a receber vem da venda de origem (crediário, cartão)
    const saleIds = [...new Set(contas.map((c: any) => c.saleId).filter(Boolean))] as string[];
    const vendas = saleIds.length ? await prisma.sale.findMany({
        where: { id: { in: saleIds } },
        select: { id: true, nfceNumber: true, Customer: { select: { name: true } } }
    }) : [];
    const porVenda = new Map(vendas.map(v => [v.id, v]));
    return contas.map((c: any) => ({
        id: c.id,
        descricao: c.description,
        valor: Number(c.amount),
        vencimento: c.dueDate,
        status: c.status,
        categoria: c.category,
        documento: c.document,
        notas: c.notes,
        valorPago: Number(c.paidAmount ?? 0),
        dataPagamento: c.paidDate,
        fornecedor: c.Supplier?.name ?? null,
        fornecedorId: c.supplierId ?? null,
        cliente: c.saleId ? porVenda.get(c.saleId)?.Customer?.name ?? null : null,
        venda: c.saleId ? porVenda.get(c.saleId)?.nfceNumber ?? null : null,
        atrasada: c.status !== 'PAID' && c.status !== 'CANCELLED' && c.dueDate < new Date()
    }));
};

// GET /api/financeiro/receber - Contas a receber
router.get('/receber', async (req: any, res: any) => {
    return res.json(await listarContas('RECEIVE', req.query.status));
});

// GET /api/financeiro/pagar - Contas a pagar
router.get('/pagar', async (req: any, res: any) => {
    return res.json(await listarContas('PAY', req.query.status));
});

// POST /api/financeiro/transacao - Lança nova conta (RECEIVE ou PAY)
router.post('/transacao', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'FINANCIAL'), async (req: any, res: any) => {
    const { tipo, descricao, valor, vencimento, categoria, documento, notas, fornecedorId } = req.body;

    if (!['RECEIVE', 'PAY'].includes(tipo)) {
        return res.status(400).json({ erro: "Tipo inválido! Use RECEIVE ou PAY." });
    }
    if (!descricao || !descricao.trim()) {
        return res.status(400).json({ erro: "Informe a descrição!" });
    }
    const valorNum = Number(valor);
    if (!valorNum || valorNum <= 0) {
        return res.status(400).json({ erro: "Informe um valor válido!" });
    }
    const venc = parseData(vencimento);
    if (!venc) {
        return res.status(400).json({ erro: "Informe a data de vencimento!" });
    }

    const empresa = await prisma.company.findUnique({ where: { id: req.operador.companyId } });
    if (!empresa) {
        return res.status(400).json({ erro: "Empresa não configurada!" });
    }

    const conta = await prisma.financialTransaction.create({
        data: {
            id: randomUUID(),
            companyId: empresa.id,
            type: tipo,
            status: venc < new Date() ? 'OVERDUE' : 'PENDING',
            description: descricao.trim().toUpperCase(),
            amount: valorNum,
            dueDate: venc,
            category: categoria ? String(categoria).trim().toUpperCase() : null,
            document: documento || null,
            notes: notas || null,
            supplierId: fornecedorId || null,
            createdAt: new Date(),
            updatedAt: new Date()
        }
    });

    return res.status(201).json({ id: conta.id, descricao: conta.description, status: conta.status });
});

// POST /api/financeiro/baixar/:id - Recebe/paga a conta
router.post('/baixar/:id', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'FINANCIAL'), async (req: any, res: any) => {
    const { id } = req.params;
    const conta = await prisma.financialTransaction.findUnique({ where: { id } });

    if (!conta) {
        return res.status(404).json({ erro: "Conta não encontrada!" });
    }
    if (conta.status === 'PAID' || conta.status === 'CANCELLED') {
        return res.status(400).json({ erro: "Conta já baixada ou cancelada!" });
    }

    const atualizada = await prisma.$transaction(async (tx) => {
        const reg = await tx.financialTransaction.update({
            where: { id },
            data: {
                status: 'PAID',
                paidDate: new Date(),
                paidAmount: Number(conta.amount),
                updatedAt: new Date()
            }
        });

        // Se for conta de repasse de cartão, baixa também o recebível vinculado
        if (reg.cardReceivableId) {
            await tx.cardReceivable.updateMany({
                where: { id: reg.cardReceivableId, status: 'PENDING' },
                data: { status: 'PAID', paidDate: new Date(), updatedAt: new Date() }
            });
        }
        return reg;
    });

    return res.json({ id: atualizada.id, status: atualizada.status });
});

// DELETE /api/financeiro/transacao/:id - Cancela uma conta pendente
router.delete('/transacao/:id', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'FINANCIAL'), async (req: any, res: any) => {
    const { id } = req.params;
    const conta = await prisma.financialTransaction.findUnique({ where: { id } });

    if (!conta) {
        return res.status(404).json({ erro: "Conta não encontrada!" });
    }
    if (conta.status === 'PAID') {
        return res.status(400).json({ erro: "Não é possível cancelar uma conta já baixada!" });
    }

    await prisma.$transaction(async (tx) => {
        await tx.financialTransaction.update({
            where: { id },
            data: { status: 'CANCELLED', updatedAt: new Date() }
        });

        // Se for conta de repasse de cartão, cancela também o recebível vinculado
        if (conta.cardReceivableId) {
            await tx.cardReceivable.updateMany({
                where: { id: conta.cardReceivableId, status: 'PENDING' },
                data: { status: 'CANCELLED', updatedAt: new Date() }
            });
        }
    });

    return res.json({ ok: true, status: 'CANCELLED' });
});

export default router;
