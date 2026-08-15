import { Router } from 'express';
import prisma from '../db';
import { autenticar } from '../middlewares/auth';

const router = Router();
router.use(autenticar);

const rangePeriodo = (de?: string, ate?: string) => {
    const range: any = {};
    if (de) range.gte = new Date(`${de}T00:00:00`);
    if (ate) range.lte = new Date(`${ate}T23:59:59`);
    return Object.keys(range).length ? { createdAt: range } : undefined;
};

// GET /api/relatorios/vendas-por-operador?de&ate - Vendas por operador no período
router.get('/vendas-por-operador', async (req: any, res: any) => {
    const { de, ate } = req.query;
    const where = rangePeriodo(de, ate);
    const vendas = await prisma.sale.findMany({
        where: { ...where, status: { in: ['COMPLETED', 'CANCELLED', 'REFUNDED'] } },
        include: { User: true }
    });

    const porOperador: Record<string, { quantidade: number; total: number; canceladas: number }> = {};
    for (const v of vendas) {
        const nome = v.User.name;
        if (!porOperador[nome]) porOperador[nome] = { quantidade: 0, total: 0, canceladas: 0 };
        porOperador[nome].quantidade += 1;
        if (v.status === 'COMPLETED') porOperador[nome].total += Number(v.total);
        else porOperador[nome].canceladas += 1;
    }

    const linhas = Object.entries(porOperador).map(([operador, d]) => ({
        operador,
        quantidade: d.quantidade,
        total: Number(d.total.toFixed(2)),
        canceladas: d.canceladas
    }));
    return res.json(linhas);
});

// GET /api/relatorios/ranking-produtos?de&ate - Produtos mais vendidos no período
router.get('/ranking-produtos', async (req: any, res: any) => {
    const { de, ate } = req.query;
    const where = rangePeriodo(de, ate);
    const itens = await prisma.saleItem.findMany({
        where: {
            Sale: { status: 'COMPLETED', ...where }
        },
        include: { Product: true }
    });

    const porProduto: Record<string, { codigo: string; nome: string; qtd: number; valor: number }> = {};
    for (const i of itens) {
        const chave = i.Product.name;
        if (!porProduto[chave]) {
            porProduto[chave] = {
                codigo: i.Product.barcode ?? i.Product.sku ?? '-',
                nome: i.Product.name,
                qtd: 0,
                valor: 0
            };
        }
        porProduto[chave].qtd += i.quantity;
        porProduto[chave].valor += Number(i.subtotal);
    }

    const linhas = Object.values(porProduto)
        .sort((a, b) => b.qtd - a.qtd)
        .map((p, idx) => ({ posicao: idx + 1, ...p, valor: Number(p.valor.toFixed(2)) }));
    return res.json(linhas);
});

// GET /api/relatorios/vendas-por-pagamento?de&ate - Totais por forma de pagamento
router.get('/vendas-por-pagamento', async (req: any, res: any) => {
    const { de, ate } = req.query;
    const where = rangePeriodo(de, ate);
    const pagamentos = await prisma.salePayment.findMany({
        where: {
            Sale: { status: 'COMPLETED', ...where }
        }
    });

    const porMetodo: Record<string, number> = {};
    for (const p of pagamentos) {
        porMetodo[p.method] = (porMetodo[p.method] ?? 0) + Number(p.amount);
    }

    const linhas = Object.entries(porMetodo)
        .map(([metodo, total]) => ({ metodo, total: Number(total.toFixed(2)) }))
        .sort((a, b) => b.total - a.total);
    return res.json(linhas);
});

// GET /api/relatorios/comissoes?de&ate - Comissões por operador (commissionRate)
router.get('/comissoes', async (req: any, res: any) => {
    const { de, ate } = req.query;
    const where = rangePeriodo(de, ate);
    const operadores = await prisma.user.findMany({
        where: { isActive: true, commissionRate: { gt: 0 } },
        include: {
            Sale: {
                where: { status: 'COMPLETED', ...where },
                select: { total: true }
            }
        }
    });

    const linhas = operadores.map(u => {
        const total = u.Sale.reduce((s, v) => s + Number(v.total), 0);
        const comissao = total * Number(u.commissionRate) / 100;
        return {
            operador: u.name,
            taxa: Number(u.commissionRate),
            totalVendido: Number(total.toFixed(2)),
            comissao: Number(comissao.toFixed(2))
        };
    }).sort((a, b) => b.comissao - a.comissao);

    return res.json(linhas);
});

// GET /api/relatorios/inadimplencia - Clientes com parcelas vencidas ou em atraso
router.get('/inadimplencia', async (_req: any, res: any) => {
    const hoje = new Date();
    const parcelas = await prisma.saleInstallment.findMany({
        where: {
            status: { in: ['PENDING', 'OVERDUE'] },
            OR: [
                { status: 'OVERDUE' },
                { dueDate: { lt: hoje } }
            ]
        },
        orderBy: { dueDate: 'asc' },
        include: {
            Sale: {
                include: { Customer: true }
            }
        }
    });

    const porCliente = new Map<string, {
        clienteId: string;
        nome: string;
        celular: string | null;
        total: number;
        qtdParcelas: number;
        maiorAtraso: number;
        vendas: { vendaId: string; numero: string | null; total: number; qtdParcelas: number; maiorAtraso: number }[];
    }>();

    for (const p of parcelas) {
        const c = p.Sale.Customer;
        if (!c) continue;
        const dias = Math.max(0, Math.floor((hoje.getTime() - new Date(p.dueDate).getTime()) / 86400000));

        let atual = porCliente.get(c.id);
        if (!atual) {
            atual = {
                clienteId: c.id,
                nome: c.name,
                celular: c.cellphone,
                total: 0,
                qtdParcelas: 0,
                maiorAtraso: 0,
                vendas: []
            };
            porCliente.set(c.id, atual);
        }

        atual.total += Number(p.amount);
        atual.qtdParcelas += 1;
        atual.maiorAtraso = Math.max(atual.maiorAtraso, dias);

        let venda = atual.vendas.find(v => v.vendaId === p.Sale.id);
        if (!venda) {
            venda = { vendaId: p.Sale.id, numero: p.Sale.nfceNumber, total: 0, qtdParcelas: 0, maiorAtraso: 0 };
            atual.vendas.push(venda);
        }
        venda.total += Number(p.amount);
        venda.qtdParcelas += 1;
        venda.maiorAtraso = Math.max(venda.maiorAtraso, dias);
    }

    const linhas = [...porCliente.values()]
        .map(c => ({
            clienteId: c.clienteId,
            nome: c.nome,
            celular: c.celular,
            total: Number(c.total.toFixed(2)),
            qtdParcelas: c.qtdParcelas,
            maiorAtraso: c.maiorAtraso,
            vendas: c.vendas.map(v => ({
                vendaId: v.vendaId,
                numero: v.numero,
                total: Number(v.total.toFixed(2)),
                qtdParcelas: v.qtdParcelas,
                maiorAtraso: v.maiorAtraso
            }))
        }))
        .sort((a, b) => b.total - a.total);

    return res.json({
        totalInadimplentes: linhas.length,
        totalEmAberto: Number(linhas.reduce((s, c) => s + c.total, 0).toFixed(2)),
        clientes: linhas
    });
});

export default router;
