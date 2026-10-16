// Receita na venda de produto SNGPC (farmácia Fase 2; D-10, D-11, contrato C-02).
// Usado pelo PDV, pela venda a prazo e pela efetivação de orçamento.
import { randomUUID } from 'crypto';
import { ReceitaEntrada, validarReceita } from './receita';

export type LinhaVendaSngpc = {
    itemId: string;
    produto: { id: string; name: string; classeSngpc?: string | null; listaPortaria344?: string | null; qtdMaxReceita?: number | null };
    quantidade: number;
    receita?: number | null; // índice em `receitas`
};

export type GrupoReceita = { indice: number; receita: ReceitaEntrada; tipoReceituario: number; itemIds: string[] };

/** Erro de venda com código para a tela (ex.: QTD_ACIMA_MAXIMO). As rotas devolvem 400 com { erro, codigo, itens }. */
export class ErroVenda extends Error {
    codigo?: string;
    itens?: unknown[];
    constructor(mensagem: string, codigo?: string, itens?: unknown[]) {
        super(mensagem);
        this.codigo = codigo;
        this.itens = itens;
    }
}

export const ehProdutoSngpc = (p: { classeSngpc?: string | null } | null | undefined) => Boolean(p?.classeSngpc);

/**
 * Agrupa as linhas SNGPC pela receita indicada e valida cada receita. Lança ErroVenda quando falta
 * receita, quando ela é inválida ou quando há alerta de quantidade não confirmado (D-04).
 */
export function prepararReceitas(linhas: LinhaVendaSngpc[], receitas: unknown): GrupoReceita[] {
    const lista: ReceitaEntrada[] = Array.isArray(receitas) ? receitas : [];
    const porIndice = new Map<number, LinhaVendaSngpc[]>();
    for (const l of linhas) {
        const i = l.receita === undefined || l.receita === null || l.receita === ('' as any) ? NaN : Number(l.receita);
        if (!Number.isInteger(i) || !lista[i]) {
            throw new ErroVenda(`Receita obrigatória para ${l.produto.name}!`);
        }
        porIndice.set(i, [...(porIndice.get(i) ?? []), l]);
    }

    const grupos: GrupoReceita[] = [];
    for (const [indice, itens] of porIndice) {
        const receita = lista[indice];
        const v = validarReceita(receita, itens.map(l => ({ produto: l.produto, quantidade: l.quantidade })));
        if (v.erros.length) throw new ErroVenda(v.erros[0]);
        if (v.alertas.length && !receita.quantidadeConfirmada) {
            throw new ErroVenda(
                `Quantidade acima do máximo por receita: ${v.alertas.map(a => `${a.produto} (${a.quantidade} > ${a.maximo})`).join(', ')}. Confirme para continuar.`,
                'QTD_ACIMA_MAXIMO',
                v.alertas
            );
        }
        grupos.push({ indice, receita, tipoReceituario: v.tipoReceituario!, itemIds: itens.map(l => l.itemId) });
    }
    return grupos;
}

const txt = (v: unknown) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const int = (v: unknown) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Math.trunc(Number(v)));

/** Grava as receitas da venda (depois do Sale existir) e liga os SaleItem a elas. */
export async function gravarReceitas(tx: any, companyId: string, saleId: string, grupos: GrupoReceita[]) {
    for (const g of grupos) {
        const r = g.receita;
        const id = randomUUID();
        await tx.receita.create({
            data: {
                id,
                companyId,
                saleId,
                tipoReceituario: g.tipoReceituario,
                numero: txt(r.numero),
                dataPrescricao: new Date(`${String(r.dataPrescricao).slice(0, 10)}T00:00:00`),
                uso: Number(r.uso),
                prescritorNome: String(r.prescritor?.nome ?? '').trim(),
                prescritorConselho: String(r.prescritor?.conselho ?? '').trim().toUpperCase(),
                prescritorNumero: String(r.prescritor?.numero ?? '').trim(),
                prescritorUf: String(r.prescritor?.uf ?? '').trim().toUpperCase(),
                compradorNome: txt(r.comprador?.nome),
                compradorTipoDoc: int(r.comprador?.tipoDocumento),
                compradorDocumento: txt(r.comprador?.documento),
                compradorOrgao: txt(r.comprador?.orgaoExpedidor)?.toUpperCase() ?? null,
                compradorUf: txt(r.comprador?.uf)?.toUpperCase() ?? null,
                pacienteNome: txt(r.paciente?.nome),
                pacienteIdade: int(r.paciente?.idade),
                pacienteUnidadeIdade: int(r.paciente?.unidadeIdade),
                pacienteSexo: int(r.paciente?.sexo),
                pacienteCid: txt(r.paciente?.cid),
                quantidadeConfirmada: Boolean(r.quantidadeConfirmada),
                createdAt: new Date()
            }
        });
        await tx.saleItem.updateMany({ where: { id: { in: g.itemIds } }, data: { receitaId: id } });
    }
}

/** Corpo de erro 400 das rotas de venda, com código e itens quando houver. */
export function corpoErroVenda(error: any) {
    return {
        erro: error?.message,
        ...(error?.codigo ? { codigo: error.codigo } : {}),
        ...(error?.itens ? { itens: error.itens } : {})
    };
}
