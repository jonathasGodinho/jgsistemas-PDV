// FEFO — First Expired, First Out (decisões D-09 e D-17).
//
// Regra: a venda consome primeiro o lote de menor validade e lote VENCIDO nunca
// é selecionado. Produto sem lote segue o fluxo antigo (saldo agregado do
// Inventory): as funções devolvem [] e o chamador mantém o comportamento atual.
import prisma from '../db';
import { empresaAtual } from '../tenant';

export type LoteConsumido = {
    loteId: string;
    lote: string;
    validade: Date;
    quantidade: number;
};

// Cliente mínimo usado pelo serviço: serve tanto o Prisma da requisição quanto o `tx` de uma transação.
export type ClienteLotes = {
    lote: {
        findMany: (args?: any) => Promise<any[]>;
        update: (args: any) => Promise<any>;
    };
};

const arredondar = (n: number) => Math.round(n * 1000) / 1000;

/** Validade em dd/mm/aaaa (usada nos rótulos de lote do estoque e dos movimentos). */
export function formatarValidade(validade: Date): string {
    const d = new Date(validade);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${d.getFullYear()}`;
}

function inicioDoDia(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

/**
 * Lotes com saldo do produto na filial, em ordem de validade crescente.
 * Lotes vencidos ficam de fora (D-17).
 */
export async function lotesDisponiveis(
    produtoId: string,
    filialId: string,
    cliente: ClienteLotes = prisma,
    hoje: Date = new Date()
): Promise<any[]> {
    const companyId = empresaAtual();
    return cliente.lote.findMany({
        where: {
            ...(companyId ? { companyId } : {}),
            productId: produtoId,
            branchId: filialId,
            quantidade: { gt: 0 },
            validade: { gte: inicioDoDia(hoje) }
        },
        orderBy: [{ validade: 'asc' }, { lote: 'asc' }]
    });
}

/**
 * Quanto sai de cada lote, em ordem de validade, para atender `quantidade`.
 * Só calcula — não grava nada. Devolve [] (fallback) quando o produto não tem lote.
 */
export async function selecionarLotes(
    produtoId: string,
    filialId: string,
    quantidade: number,
    cliente: ClienteLotes = prisma
): Promise<LoteConsumido[]> {
    const pedido = Math.round((Number(quantidade) || 0) * 1000) / 1000;
    if (pedido <= 0) return [];

    const disponiveis = await lotesDisponiveis(produtoId, filialId, cliente);
    const selecionados: LoteConsumido[] = [];
    let restante = pedido;
    for (const l of disponiveis) {
        if (restante <= 0) break;
        const saldo = Math.round((Number(l.quantidade) || 0) * 1000) / 1000;
        if (saldo <= 0) continue;
        const usar = Math.min(saldo, restante);
        selecionados.push({ loteId: l.id, lote: l.lote, validade: l.validade, quantidade: usar });
        restante = Math.round((restante - usar) * 1000) / 1000;
    }
    return selecionados;
}

/**
 * Baixa o saldo dos lotes selecionados (FEFO), dentro da transação do chamador.
 * Produto sem lote devolve [] e nada muda — a venda segue pelo saldo agregado (D-09).
 */
export async function baixarLotesFefo(
    produtoId: string,
    filialId: string,
    quantidade: number,
    cliente: ClienteLotes = prisma
): Promise<LoteConsumido[]> {
    const selecionados = await selecionarLotes(produtoId, filialId, quantidade, cliente);
    for (const l of selecionados) {
        await cliente.lote.update({
            where: { id: l.loteId },
            data: { quantidade: { decrement: l.quantidade }, updatedAt: new Date() }
        });
    }
    return selecionados;
}
