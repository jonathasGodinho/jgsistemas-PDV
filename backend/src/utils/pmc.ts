// PMC (Preço Máximo ao Consumidor) da CMED — teto legal de venda de medicamentos.
//
// D-11: a lista da CMED é casada com o produto pelo Registro MS.
// D-08: o bloqueio só existe quando o produto tem PMC — produto sem PMC vende normal.
import prisma from '../db';

// Converte o valor bruto do cadastro em número utilizável (ou null).
function comoPreco(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === '') return null;
    const numero = Number(valor);
    return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

// PMC da CMED para um Registro MS (null quando não há linha para o registro).
export async function resolverPmc(registroMS?: string | null): Promise<number | null> {
    const registro = String(registroMS ?? '').trim();
    if (!registro) return null;

    const linha = await prisma.cmedPreco.findFirst({
        where: { registroMS: registro },
        orderBy: { updatedAt: 'desc' }
    });

    return linha ? comoPreco(linha.pmc) : null;
}

// PMC efetivo do produto: a lista da CMED tem prioridade; sem linha na CMED,
// vale o PMC cadastrado no próprio produto.
export async function pmcDoProduto(produto: { registroMS?: string | null; pmc?: unknown }): Promise<number | null> {
    const daCmed = await resolverPmc(produto?.registroMS);
    if (daCmed !== null) return daCmed;

    return comoPreco(produto?.pmc);
}
