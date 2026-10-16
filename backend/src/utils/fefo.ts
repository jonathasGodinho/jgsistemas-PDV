// FEFO — First Expired, First Out (decisões D-09, D-17 e D-20).
//
// Regra: a venda consome primeiro o lote de menor validade e lote VENCIDO nunca
// é selecionado. Produto sem lote segue o fluxo antigo (saldo agregado do
// Inventory): as funções devolvem [] e o chamador mantém o comportamento atual.
//
// D-20 — livro-razão do lote: toda mudança de saldo de um Lote grava uma linha em
// LoteMovimento, ligada à venda/item quando vem de venda. Assim:
//   - cancelamento e devolução recompõem EXATAMENTE o lote que a venda consumiu
//     (mesmo que ele tenha vencido depois — o FEFO continua ignorando vencidos);
//   - nenhum estorno devolve mais do que foi consumido (estorno aponta para a
//     linha de VENDA por origemId);
//   - invariante: soma dos lotes do produto na filial ≤ Inventory.quantity. A
//     diferença é o "saldo sem lote". Saída e ajuste manuais que desceriam o
//     estoque abaixo da soma dos lotes baixam os lotes (vencidos primeiro).
import { randomUUID } from 'crypto';
import prisma from '../db';
import { empresaAtual } from '../tenant';

export type LoteConsumido = {
    loteId: string;
    lote: string;
    validade: Date;
    quantidade: number;
};

// Cliente usado pelo serviço: serve tanto o Prisma da requisição quanto o `tx` de uma transação.
export type ClienteLotes = any;

export type ContextoMovimento = {
    tipo?: string;
    saleId?: string | null;
    saleItemId?: string | null;
    referencia?: string | null;
    userId?: string | null;
    // Fase 2 (SNGPC): NF da entrada e motivo da perda (st_TipoMotivoPerda 1-9)
    nfNumero?: string | null;
    nfData?: Date | null;
    cnpjOrigem?: string | null;
    motivoPerda?: number | null;
};

const arred = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

/** Validade em dd/mm/aaaa (usada nos rótulos de lote do estoque e dos movimentos). */
export function formatarValidade(validade: Date): string {
    const d = new Date(validade);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${d.getFullYear()}`;
}

/** Sufixo do motivo do movimento de estoque com os lotes usados: " · Lote A (val dd/mm/aaaa), B (...)". */
export function rotuloLotes(lotes: { lote: string; validade: Date }[]): string {
    if (!lotes.length) return '';
    const partes = lotes.map(l => `${l.lote} (val ${formatarValidade(l.validade)})`);
    return ` · ${lotes.length === 1 ? 'Lote' : 'Lotes'} ${partes.join(', ')}`;
}

function inicioDoDia(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function filtroEmpresa() {
    const companyId = empresaAtual();
    return companyId ? { companyId } : {};
}

/** Grava uma linha no livro-razão e aplica o delta no saldo do lote (mesma transação do chamador). */
async function movimentarLote(
    cliente: ClienteLotes,
    lote: { id: string; companyId: string },
    delta: number,
    ctx: ContextoMovimento & { origemId?: string | null }
) {
    const qtd = arred(delta);
    if (qtd === 0) return null;
    await cliente.lote.update({
        where: { id: lote.id },
        data: { quantidade: qtd > 0 ? { increment: qtd } : { decrement: -qtd }, updatedAt: new Date() }
    });
    return cliente.loteMovimento.create({
        data: {
            id: randomUUID(),
            companyId: lote.companyId,
            loteId: lote.id,
            tipo: ctx.tipo ?? (qtd > 0 ? 'ENTRADA' : 'SAIDA'),
            quantidade: qtd,
            saleId: ctx.saleId ?? null,
            saleItemId: ctx.saleItemId ?? null,
            origemId: ctx.origemId ?? null,
            referencia: ctx.referencia ?? null,
            userId: ctx.userId ?? null,
            nfNumero: ctx.nfNumero ?? null,
            nfData: ctx.nfData ?? null,
            cnpjOrigem: ctx.cnpjOrigem ?? null,
            motivoPerda: ctx.motivoPerda ?? null,
            createdAt: new Date()
        }
    });
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
    return cliente.lote.findMany({
        where: {
            ...filtroEmpresa(),
            productId: produtoId,
            branchId: filialId,
            quantidade: { gt: 0 },
            validade: { gte: inicioDoDia(hoje) }
        },
        orderBy: [{ validade: 'asc' }, { lote: 'asc' }]
    });
}

/** Todos os lotes com saldo (vencidos inclusive), do mais antigo para o mais novo. */
async function lotesComSaldo(produtoId: string, filialId: string, cliente: ClienteLotes) {
    return cliente.lote.findMany({
        where: { ...filtroEmpresa(), productId: produtoId, branchId: filialId, quantidade: { gt: 0 } },
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
    const pedido = arred(quantidade);
    if (pedido <= 0) return [];

    const disponiveis = await lotesDisponiveis(produtoId, filialId, cliente);
    const selecionados: LoteConsumido[] = [];
    let restante = pedido;
    for (const l of disponiveis) {
        if (restante <= 0) break;
        const saldo = arred(l.quantidade);
        if (saldo <= 0) continue;
        const usar = Math.min(saldo, restante);
        selecionados.push({ loteId: l.id, lote: l.lote, validade: l.validade, quantidade: usar });
        restante = arred(restante - usar);
    }
    return selecionados;
}

/**
 * Baixa o saldo dos lotes selecionados (FEFO), dentro da transação do chamador, e grava
 * cada baixa no livro-razão (tipo VENDA por padrão, com saleId/saleItemId quando houver).
 * Produto sem lote devolve [] e nada muda — a venda segue pelo saldo agregado (D-09).
 */
export async function baixarLotesFefo(
    produtoId: string,
    filialId: string,
    quantidade: number,
    cliente: ClienteLotes = prisma,
    ctx: ContextoMovimento = {}
): Promise<LoteConsumido[]> {
    const selecionados = await selecionarLotes(produtoId, filialId, quantidade, cliente);
    if (!selecionados.length) return [];
    const lotes = await cliente.lote.findMany({ where: { id: { in: selecionados.map(s => s.loteId) } } });
    const porId = new Map<string, any>(lotes.map((l: any) => [l.id, l]));
    for (const l of selecionados) {
        await movimentarLote(cliente, porId.get(l.loteId), -l.quantidade, { tipo: 'VENDA', ...ctx });
    }
    return selecionados;
}

/**
 * Venda não pode sair de lote vencido (D-17). Quando o produto tem lotes, o estoque vendável
 * é o saldo agregado menos o saldo dos lotes vencidos; sem isso a venda levaria o estoque para
 * baixo da soma dos lotes e quebraria a invariante do D-20.
 */
export async function validarEstoqueVendavel(
    cliente: ClienteLotes,
    produto: { id: string; name: string },
    filialId: string,
    quantidade: number,
    estoqueQuantidade: number
) {
    const vencidos = await cliente.lote.aggregate({
        where: {
            ...filtroEmpresa(),
            productId: produto.id,
            branchId: filialId,
            quantidade: { gt: 0 },
            validade: { lt: inicioDoDia(new Date()) }
        },
        _sum: { quantidade: true }
    });
    const saldoVencido = arred(vencidos._sum?.quantidade ?? 0);
    if (saldoVencido <= 0) return;
    const vendavel = arred(estoqueQuantidade - saldoVencido);
    if (quantidade > vendavel) {
        throw new Error(
            `Estoque vendável insuficiente para ${produto.name}: ${Math.max(0, vendavel)} disponível(is); ` +
            `${saldoVencido} unidade(s) estão em lote vencido e não podem ser vendidas.`
        );
    }
}

/**
 * Estorna o que uma venda consumiu dos lotes (D-20). Recompõe exatamente o lote original de
 * cada baixa, nunca acima do que ainda não foi estornado. Sem `quantidade`, estorna tudo
 * (cancelamento). Com `quantidade`, estorna até esse total (devolução parcial), começando
 * pela última baixa feita — a de maior validade dentro da venda.
 * Filtros opcionais restringem a um item (`saleItemId`) ou produto (`productId`).
 * Devolve a quantidade efetivamente recomposta (venda anterior ao livro-razão devolve 0).
 */
export async function estornarLotesDaVenda(
    cliente: ClienteLotes,
    saleId: string,
    ctx: ContextoMovimento & { quantidade?: number; saleItemId?: string | null; productId?: string | null }
): Promise<{ recomposto: number; lotes: { lote: string; validade: Date; quantidade: number }[] }> {
    const baixas = await cliente.loteMovimento.findMany({
        where: {
            ...filtroEmpresa(),
            saleId,
            tipo: 'VENDA',
            ...(ctx.saleItemId ? { saleItemId: ctx.saleItemId } : {}),
            ...(ctx.productId ? { Lote: { productId: ctx.productId } } : {})
        },
        include: { Lote: true },
        orderBy: { createdAt: 'asc' }
    });
    if (!baixas.length) return { recomposto: 0, lotes: [] };

    const estornos = await cliente.loteMovimento.findMany({
        where: { ...filtroEmpresa(), origemId: { in: baixas.map((b: any) => b.id) } }
    });
    const jaEstornado = new Map<string, number>();
    for (const e of estornos) jaEstornado.set(e.origemId, arred((jaEstornado.get(e.origemId) ?? 0) + Number(e.quantidade)));

    let restante = ctx.quantidade === undefined ? Infinity : arred(ctx.quantidade);
    let recomposto = 0;
    const lotes: { lote: string; validade: Date; quantidade: number }[] = [];
    for (const b of [...baixas].reverse()) {
        if (restante <= 0) break;
        const pendente = arred(-Number(b.quantidade) - (jaEstornado.get(b.id) ?? 0));
        if (pendente <= 0) continue;
        const qtd = Math.min(pendente, restante);
        await movimentarLote(cliente, b.Lote, qtd, {
            tipo: ctx.tipo ?? 'CANCELAMENTO',
            saleId,
            saleItemId: b.saleItemId,
            origemId: b.id,
            referencia: ctx.referencia,
            userId: ctx.userId
        });
        lotes.push({ lote: b.Lote.lote, validade: b.Lote.validade, quantidade: qtd });
        recomposto = arred(recomposto + qtd);
        restante = arred(restante - qtd);
    }
    return { recomposto, lotes };
}

/**
 * Credita um lote (acha pelo número + validade ou cria) e grava a entrada no livro-razão.
 * Usado pelo recebimento de compra e pela entrada manual com lote.
 */
export async function entradaEmLote(
    cliente: ClienteLotes,
    dados: { companyId: string; branchId: string; productId: string; lote: string; validade: Date; quantidade: number },
    ctx: ContextoMovimento = {}
) {
    const qtd = arred(dados.quantidade);
    if (qtd <= 0) return null;
    const chave = {
        companyId: dados.companyId,
        branchId: dados.branchId,
        productId: dados.productId,
        lote: dados.lote,
        validade: dados.validade
    };
    let lote = await cliente.lote.findFirst({ where: chave });
    if (!lote) {
        lote = await cliente.lote.create({
            data: { id: randomUUID(), ...chave, quantidade: 0, createdAt: new Date(), updatedAt: new Date() }
        });
    }
    await movimentarLote(cliente, lote, qtd, { tipo: 'ENTRADA', ...ctx });
    return lote;
}

/**
 * Baixa de um lote específico (saída manual informando o lote).
 */
export async function saidaDeLote(cliente: ClienteLotes, loteId: string, quantidade: number, ctx: ContextoMovimento = {}) {
    const lote = await cliente.lote.findFirst({ where: { ...filtroEmpresa(), id: loteId } });
    if (!lote) throw new Error('Lote não encontrado!');
    const qtd = arred(quantidade);
    if (qtd > arred(lote.quantidade)) {
        throw new Error(`O lote ${lote.lote} tem apenas ${arred(lote.quantidade)} unidade(s).`);
    }
    await movimentarLote(cliente, lote, -qtd, { tipo: 'SAIDA_MANUAL', ...ctx });
    return lote;
}

/** Soma do saldo dos lotes do produto na filial. */
export async function somaLotes(cliente: ClienteLotes, produtoId: string, filialId: string) {
    const r = await cliente.lote.aggregate({
        where: { ...filtroEmpresa(), productId: produtoId, branchId: filialId },
        _sum: { quantidade: true }
    });
    return arred(r._sum?.quantidade ?? 0);
}

/**
 * Mantém a invariante soma(lotes) ≤ estoque depois de uma saída ou ajuste manual (D-20).
 * Se o novo estoque ficou abaixo da soma dos lotes, baixa o excedente dos lotes — vencidos
 * primeiro, depois por menor validade (o que normalmente sai do estoque por perda/descarte).
 * Devolve os lotes baixados.
 */
export async function ajustarLotesAoEstoque(
    cliente: ClienteLotes,
    produtoId: string,
    filialId: string,
    novoEstoque: number,
    ctx: ContextoMovimento = {}
): Promise<LoteConsumido[]> {
    let excesso = arred((await somaLotes(cliente, produtoId, filialId)) - Math.max(0, novoEstoque));
    if (excesso <= 0) return [];
    const baixados: LoteConsumido[] = [];
    for (const l of await lotesComSaldo(produtoId, filialId, cliente)) {
        if (excesso <= 0) break;
        const usar = Math.min(arred(l.quantidade), excesso);
        await movimentarLote(cliente, l, -usar, { tipo: 'AJUSTE', ...ctx });
        baixados.push({ loteId: l.id, lote: l.lote, validade: l.validade, quantidade: usar });
        excesso = arred(excesso - usar);
    }
    return baixados;
}

/**
 * Fase 2 (D-09 da feature farmacia-controlados): produto SNGPC (controlado/antimicrobiano) só
 * sai de lote — o XML do SNGPC exige o lote em toda saída. Lança erro quando os lotes não
 * vencidos não cobrem a quantidade.
 */
export async function exigirSaldoEmLote(
    cliente: ClienteLotes,
    produto: { id: string; name: string; classeSngpc?: string | null },
    filialId: string,
    quantidade: number
) {
    if (!produto.classeSngpc) return;
    const disponiveis = await lotesDisponiveis(produto.id, filialId, cliente);
    const saldo = arred(disponiveis.reduce((s: number, l: any) => s + Number(l.quantidade), 0));
    if (quantidade > saldo) {
        throw new Error(
            `Saldo em lote insuficiente para ${produto.name}: ${saldo} unidade(s) em lote não vencido. ` +
            `Medicamento controlado/antimicrobiano só pode ser vendido com lote.`
        );
    }
}
