import { Router } from 'express';
import prisma from '../db';
import { autenticar } from '../middlewares/auth';

const router = Router();
router.use(autenticar);

// GET /api/dashboard - Resumo gerencial do dia
router.get('/', async (_req: any, res: any) => {
    const agora = new Date();
    const inicioHoje = new Date(agora);
    inicioHoje.setHours(0, 0, 0, 0);
    const fimHoje = new Date(inicioHoje);
    fimHoje.setDate(fimHoje.getDate() + 1);
    const inicioOntem = new Date(inicioHoje);
    inicioOntem.setDate(inicioOntem.getDate() - 1);

    const [vendasHoje, caixasAbertos, contas, estoqueBaixo, topItens, vendasPorOperador, ontem] = await Promise.all([
        prisma.sale.findMany({
            where: { status: 'COMPLETED', createdAt: { gte: inicioHoje, lt: fimHoje } },
            include: { SalePayment: true }
        }),
        prisma.cashRegister.findMany({
            where: { status: 'OPEN' },
            include: { User: true }
        }),
        prisma.financialTransaction.findMany({
            where: { status: { in: ['PENDING', 'OVERDUE'] } }
        }),
        prisma.product.findMany({
            where: { isActive: true },
            include: { Inventory: true }
        }),
        prisma.saleItem.findMany({
            where: { Sale: { status: 'COMPLETED', createdAt: { gte: inicioHoje, lt: fimHoje } } },
            include: { Product: true }
        }),
        prisma.sale.findMany({
            where: { status: 'COMPLETED', createdAt: { gte: inicioHoje, lt: fimHoje } },
            include: { User: true }
        }),
        prisma.sale.aggregate({
            where: { status: 'COMPLETED', createdAt: { gte: inicioOntem, lt: inicioHoje } },
            _sum: { total: true },
            _count: true
        })
    ]);

    // Vendas por hora do dia (0h-23h)
    const porHora = Array.from({ length: 24 }, () => 0);
    for (const v of vendasHoje) porHora[new Date(v.createdAt).getHours()] += Number(v.total);

    let totalVendas = 0;
    const porMetodo: Record<string, number> = {};
    for (const v of vendasHoje) {
        totalVendas += Number(v.total);
        for (const p of v.SalePayment) {
            porMetodo[p.method] = (porMetodo[p.method] ?? 0) + Number(p.amount);
        }
    }

    const vencidas = (tipo: string) => contas.filter(c => c.type === tipo && c.dueDate < inicioHoje);
    const receberVencidas = contas
        .filter(c => c.type === 'RECEIVE' && c.dueDate < inicioHoje)
        .reduce((s, c) => s + Number(c.amount), 0);
    const pagarVencidas = contas
        .filter(c => c.type === 'PAY' && c.dueDate < inicioHoje)
        .reduce((s, c) => s + Number(c.amount), 0);

    const porProduto: Record<string, { nome: string; qtd: number; valor: number }> = {};
    for (const i of topItens) {
        const nome = i.Product.name;
        if (!porProduto[nome]) porProduto[nome] = { nome, qtd: 0, valor: 0 };
        porProduto[nome].qtd += i.quantity;
        porProduto[nome].valor += Number(i.subtotal);
    }
    const topProdutos = Object.values(porProduto)
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 10);

    const baixos = estoqueBaixo
        .map(p => {
            const quantidade = p.Inventory.reduce((s, i) => s + i.quantity, 0);
            const minimo = p.Inventory.reduce((s, i) => s + i.minQuantity, 0);
            return { nome: p.name, quantidade, minimo };
        })
        .filter(p => p.quantidade <= p.minimo)
        .sort((a, b) => a.quantidade - b.quantidade)
        .slice(0, 10);

    const porOperador: Record<string, number> = {};
    for (const v of vendasPorOperador) {
        porOperador[v.User.name] = (porOperador[v.User.name] ?? 0) + Number(v.total);
    }

    return res.json({
        vendasHoje: {
            total: Number(totalVendas.toFixed(2)),
            quantidade: vendasHoje.length,
            ticketMedio: vendasHoje.length ? Number((totalVendas / vendasHoje.length).toFixed(2)) : 0,
            porHora: porHora.map(v => Number(v.toFixed(2))),
            porMetodo: Object.fromEntries(
                Object.entries(porMetodo).map(([k, v]) => [k, Number(v.toFixed(2))])
            )
        },
        caixasAbertos: caixasAbertos.map(c => ({
            numero: c.number,
            operador: c.User.name,
            abertoEm: c.openedAt
        })),
        contas: {
            receberVencidas: Number(receberVencidas.toFixed(2)),
            pagarVencidas: Number(pagarVencidas.toFixed(2)),
            receberVencidasQtd: vencidas('RECEIVE').length,
            pagarVencidasQtd: vencidas('PAY').length
        },
        ontem: {
            total: Number(Number(ontem._sum.total ?? 0).toFixed(2)),
            quantidade: ontem._count
        },
        estoqueBaixo: baixos,
        topProdutos,
        vendasPorOperador: Object.fromEntries(
            Object.entries(porOperador).map(([k, v]) => [k, Number(v.toFixed(2))])
        )
    });
});

export default router;
