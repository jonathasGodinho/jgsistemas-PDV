import prisma from '../db';

export interface AnaliseCredito {
    score: number;
    faixa: string;
    limiteSugerido: number;
    detalhes: {
        tempoCadastro: number;
        totalCompras: number;
        ticketMedio: number;
        parcelasVencidas: number;
        valorEmAberto: number;
        cashback: number;
    };
}

// Calcula score e limite sugerido de crédito para o cliente
export const calcularAnaliseCredito = async (clienteId: string): Promise<AnaliseCredito> => {
    const cliente = await prisma.customer.findUnique({
        where: { id: clienteId },
        include: { CashbackBalance: true }
    });
    if (!cliente) {
        throw new Error("Cliente não encontrado!");
    }

    const vendas = await prisma.sale.findMany({
        where: { customerId: clienteId, status: 'COMPLETED' },
        select: { total: true, createdAt: true }
    });

    const diasCadastro = Math.floor((Date.now() - new Date(cliente.createdAt).getTime()) / 86400000);
    const totalCompras = vendas.reduce((s, v) => s + Number(v.total), 0);
    const ticketMedio = vendas.length > 0 ? totalCompras / vendas.length : 0;

    const parcelas = await prisma.saleInstallment.findMany({
        where: {
            Sale: { customerId: clienteId },
            status: { in: ['PENDING', 'OVERDUE'] }
        },
        select: { amount: true, status: true, dueDate: true }
    });
    const hoje = new Date();
    const vencidas = parcelas.filter(p => p.status === 'OVERDUE' || (p.status === 'PENDING' && p.dueDate < hoje));
    const valorEmAberto = parcelas.reduce((s, p) => s + Number(p.amount), 0);
    const cashback = Number(cliente.CashbackBalance?.balance ?? 0);

    let score = 0;

    // Tempo de cadastro (até 20)
    if (diasCadastro >= 180) score += 20;
    else if (diasCadastro >= 90) score += 15;
    else if (diasCadastro >= 30) score += 10;

    // Histórico de compras (até 20)
    if (vendas.length > 10) score += 20;
    else if (vendas.length >= 4) score += 15;
    else if (vendas.length >= 1) score += 10;

    // Inadimplência (até 20)
    if (vencidas.length === 0) score += 20;
    else if (vencidas.length === 1) score += 5;
    else score -= 20;

    // Cashback acumulado (até 10)
    if (cashback > 0) score += 10;

    // Ticket médio (até 10)
    if (ticketMedio > 100) score += 10;
    else if (ticketMedio > 50) score += 5;

    score = Math.max(0, Math.min(100, score));

    const faixa = score >= 70 ? 'EXCELENTE' : score >= 50 ? 'BOA' : score >= 30 ? 'REGULAR' : 'BAIXA';

    let limiteSugerido = 0;
    if (score >= 70) limiteSugerido = Math.max(100, Math.round(ticketMedio * 3));
    else if (score >= 50) limiteSugerido = Math.max(50, Math.round(ticketMedio * 2));
    else if (score >= 30) limiteSugerido = Math.max(0, Math.round(ticketMedio));
    else limiteSugerido = 0;

    return {
        score,
        faixa,
        limiteSugerido,
        detalhes: {
            tempoCadastro: diasCadastro,
            totalCompras: Number(totalCompras.toFixed(2)),
            ticketMedio: Number(ticketMedio.toFixed(2)),
            parcelasVencidas: vencidas.length,
            valorEmAberto: Number(valorEmAberto.toFixed(2)),
            cashback: Number(cashback.toFixed(2))
        }
    };
};
