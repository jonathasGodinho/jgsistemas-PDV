// Blocos entradaMedicamentos e saidaMedicamentoPerda do XML de movimentação do SNGPC
// (farmácia Fase 2; Guia SNGPC v2.3 §4, exemplo p.12-13; D-12, D-13, D-14).
// Fonte: livro-razão do lote no período. Entradas (compra e entrada manual) agrupadas por NF;
// saídas negativas manuais (saída, ajuste, conciliação) agrupadas por motivo e data.
import { CLASSE_TERAPEUTICA, ClasseSngpc } from './regras';
import { Pendencia, cnpjEmissor, iso } from './inventario';
import { limitesDoPeriodo } from './xmlVendas';

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const el = (nome: string, valor: unknown) => (valor === null || valor === undefined || valor === '' ? `<${nome}/>` : `<${nome}>${esc(valor)}</${nome}>`);

const TIPOS_ENTRADA = ['ENTRADA_COMPRA', 'ENTRADA_MANUAL'];
const TIPOS_PERDA = ['SAIDA_MANUAL', 'AJUSTE', 'CONCILIACAO'];

export async function blocosEntradaPerda(
    cliente: any,
    op: { filialId: string; inicio: Date; fim: Date }
): Promise<{ entradas: string[]; perdas: string[]; pendencias: Pendencia[] }> {
    const { de, ate } = limitesDoPeriodo(op.inicio, op.fim);
    const movimentos = await cliente.loteMovimento.findMany({
        where: {
            tipo: { in: [...TIPOS_ENTRADA, ...TIPOS_PERDA] },
            createdAt: { gte: de, lte: ate },
            Lote: { branchId: op.filialId, Product: { classeSngpc: { not: null } } }
        },
        include: { Lote: { include: { Product: true } } },
        orderBy: { createdAt: 'asc' }
    });
    const pendencias: Pendencia[] = [];
    const destino = await cnpjEmissor(cliente, op.filialId);

    // Entradas por NF
    const notas = new Map<string, { nf: any; data: Date; itens: string[] }>();
    // Perdas por motivo + dia
    const perdas = new Map<string, { motivo: number; dia: string; itens: string[] }>();
    for (const m of movimentos) {
        const p = m.Lote.Product;
        const qtd = Math.round(Number(m.quantidade));
        if (TIPOS_ENTRADA.includes(m.tipo) && qtd > 0) {
            if (!m.nfNumero || !m.nfData || !m.cnpjOrigem) {
                pendencias.push({ codigo: 'ENTRADA_SEM_NF', produto: p.name, detalhe: `Entrada do lote ${m.Lote.lote} sem nota fiscal: escriture manualmente no SNGPC.` });
                continue;
            }
            const chave = `${m.nfNumero}|${iso(new Date(m.nfData))}|${m.cnpjOrigem}`;
            const g = notas.get(chave) ?? { nf: m, data: new Date(m.createdAt), itens: [] as string[] };
            g.itens.push('<medicamentoEntrada>'
                + el('classeTerapeutica', CLASSE_TERAPEUTICA[p.classeSngpc as ClasseSngpc]) + el('registroMSMedicamento', p.registroMS)
                + el('numeroLoteMedicamento', m.Lote.lote) + el('quantidadeMedicamento', qtd) + el('unidadeMedidaMedicamento', p.unidadeSngpc ?? 1)
                + '</medicamentoEntrada>');
            notas.set(chave, g);
        } else if (TIPOS_PERDA.includes(m.tipo) && qtd < 0) {
            if (!m.motivoPerda) {
                pendencias.push({ codigo: 'PERDA_SEM_MOTIVO', produto: p.name, detalhe: `Saída de ${-qtd} do lote ${m.Lote.lote} sem motivo SNGPC: escriture manualmente.` });
                continue;
            }
            const dia = iso(new Date(m.createdAt));
            const chave = `${m.motivoPerda}|${dia}`;
            const g = perdas.get(chave) ?? { motivo: m.motivoPerda, dia, itens: [] as string[] };
            g.itens.push('<medicamentoPerda>'
                + el('registroMSMedicamento', p.registroMS) + el('numeroLoteMedicamento', m.Lote.lote)
                + el('quantidadeMedicamento', -qtd) + el('unidadeMedidaMedicamento', p.unidadeSngpc ?? 1)
                + '</medicamentoPerda>');
            perdas.set(chave, g);
        }
    }

    const entradas = [...notas.values()].map(g => '<entradaMedicamentos>'
        + '<notaFiscalEntradaMedicamento>' + el('numeroNotaFiscal', g.nf.nfNumero) + el('tipoOperacaoNotaFiscal', 1)
        + el('dataNotaFiscal', iso(new Date(g.nf.nfData))) + el('cnpjOrigem', g.nf.cnpjOrigem) + el('cnpjDestino', destino)
        + '</notaFiscalEntradaMedicamento>'
        + g.itens.join('') + el('dataRecebimentoMedicamento', iso(g.data)) + '</entradaMedicamentos>');
    const blocosPerda = [...perdas.values()].map(g => '<saidaMedicamentoPerda>'
        + el('motivoPerdaMedicamento', g.motivo) + g.itens.join('') + el('dataPerdaMedicamento', g.dia) + '</saidaMedicamentoPerda>');
    return { entradas, perdas: blocosPerda, pendencias };
}
