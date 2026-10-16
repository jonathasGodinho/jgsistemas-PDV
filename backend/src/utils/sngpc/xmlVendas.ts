// Bloco saidaMedicamentoVendaAoConsumidor do XML de movimentação do SNGPC
// (farmácia Fase 2; Guia SNGPC v2.3 §4, exemplo p.12-13; D-12).
// Fonte: baixas VENDA do livro-razão do lote no período, líquidas dos estornos já feitos
// (venda cancelada antes da exportação não entra). Um bloco por receita; dentro dele, um
// medicamentoVenda por produto+lote.
import { Pendencia, iso } from './inventario';

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const el = (nome: string, valor: unknown) => (valor === null || valor === undefined || valor === '' ? `<${nome}/>` : `<${nome}>${esc(valor)}</${nome}>`);

export function limitesDoPeriodo(inicio: Date, fim: Date) {
    const de = new Date(inicio); de.setHours(0, 0, 0, 0);
    const ate = new Date(fim); ate.setHours(23, 59, 59, 999);
    return { de, ate };
}

export async function blocoVendas(
    cliente: any,
    op: { filialId: string; inicio: Date; fim: Date }
): Promise<{ blocos: string[]; pendencias: Pendencia[] }> {
    const { de, ate } = limitesDoPeriodo(op.inicio, op.fim);
    const baixas = await cliente.loteMovimento.findMany({
        where: { tipo: 'VENDA', createdAt: { gte: de, lte: ate }, Lote: { branchId: op.filialId, Product: { classeSngpc: { not: null } } } },
        include: { Lote: { include: { Product: true } } },
        orderBy: { createdAt: 'asc' }
    });
    if (!baixas.length) return { blocos: [], pendencias: [] };

    const estornos = await cliente.loteMovimento.findMany({ where: { origemId: { in: baixas.map((b: any) => b.id) } } });
    const estornado = new Map<string, number>();
    for (const e of estornos) estornado.set(e.origemId, (estornado.get(e.origemId) ?? 0) + Number(e.quantidade));

    const itemIds = [...new Set(baixas.map((b: any) => b.saleItemId).filter(Boolean))] as string[];
    const itens = await cliente.saleItem.findMany({ where: { id: { in: itemIds } }, include: { Receita: true, Sale: true } });
    const porItem = new Map<string, any>(itens.map((i: any) => [i.id, i]));

    const pendencias: Pendencia[] = [];
    // receitaId → { receita, venda, linhas: chave produto|lote → quantidade }
    const grupos = new Map<string, { receita: any; venda: any; classe: string; linhas: Map<string, { produto: any; lote: string; qtd: number }> }>();
    for (const b of baixas) {
        const liquido = Math.round(-Number(b.quantidade) - (estornado.get(b.id) ?? 0));
        if (liquido <= 0) continue;
        const item = b.saleItemId ? porItem.get(b.saleItemId) : null;
        if (!item?.Receita) {
            pendencias.push({ codigo: 'VENDA_SEM_RECEITA', produto: b.Lote.Product.name, detalhe: `Venda ${item?.Sale?.nfceNumber ?? '-'} sem receita registrada: escriture manualmente no SNGPC.` });
            continue;
        }
        const g = grupos.get(item.Receita.id) ?? { receita: item.Receita, venda: item.Sale, classe: b.Lote.Product.classeSngpc, linhas: new Map() };
        const chave = `${b.Lote.Product.id}|${b.Lote.lote}`;
        const linha = g.linhas.get(chave) ?? { produto: b.Lote.Product, lote: b.Lote.lote, qtd: 0 };
        linha.qtd += liquido;
        g.linhas.set(chave, linha);
        grupos.set(item.Receita.id, g);
    }

    const blocos: string[] = [];
    for (const g of grupos.values()) {
        const r = g.receita;
        const antimicrobiano = g.classe === 'ANTIMICROBIANO';
        const comprador = antimicrobiano ? '' : '<compradorMedicamento>'
            + el('nomeComprador', r.compradorNome) + el('tipoDocumento', r.compradorTipoDoc) + el('numeroDocumento', r.compradorDocumento)
            + el('orgaoExpedidor', r.compradorOrgao) + el('UFEmissaoDocumento', r.compradorUf) + '</compradorMedicamento>';
        const paciente = antimicrobiano ? '<pacienteMedicamento>'
            + el('nome', r.pacienteNome) + el('idade', r.pacienteIdade) + el('unidadeIdade', r.pacienteUnidadeIdade)
            + el('sexo', r.pacienteSexo) + el('cid', r.pacienteCid) + '</pacienteMedicamento>' : '';
        const medicamentos = [...g.linhas.values()].map(l => '<medicamentoVenda>'
            + el('usoProlongado', antimicrobiano ? 'N' : null)
            + el('registroMSMedicamento', l.produto.registroMS) + el('numeroLoteMedicamento', l.lote)
            + el('quantidadeMedicamento', l.qtd) + el('unidadeMedidaMedicamento', l.produto.unidadeSngpc ?? 1)
            + '</medicamentoVenda>').join('');
        blocos.push('<saidaMedicamentoVendaAoConsumidor>'
            + el('tipoReceituarioMedicamento', r.tipoReceituario) + el('numeroNotificacaoMedicamento', r.numero)
            + el('dataPrescricaoMedicamento', iso(new Date(r.dataPrescricao)))
            + '<prescritorMedicamento>' + el('nomePrescritor', r.prescritorNome) + el('numeroRegistroProfissional', r.prescritorNumero)
            + el('conselhoProfissional', r.prescritorConselho) + el('UFConselho', r.prescritorUf) + '</prescritorMedicamento>'
            + el('usoMedicamento', r.uso) + comprador + paciente + medicamentos
            + el('dataVendaMedicamento', iso(new Date(g.venda.createdAt)))
            + '</saidaMedicamentoVendaAoConsumidor>');
    }
    return { blocos, pendencias };
}
