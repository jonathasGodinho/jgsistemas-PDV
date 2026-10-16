// XML de inventário do SNGPC (farmácia Fase 2; Guia SNGPC v2.3 §3, D-15, D-18).
// Raiz mensagemSNGPCInventario (urn:sngpc-schema, iso-8859-1): cabeçalho com CNPJ emissor,
// CPF do RT e data; corpo com um entradaMedicamentos/medicamentoEntrada por lote com saldo.
import { CLASSE_TERAPEUTICA, ClasseSngpc } from './regras';

export type Pendencia = { codigo: 'SALDO_SEM_LOTE' | 'SEM_REGISTRO_MS' | 'SEM_CNPJ' | 'VENDA_SEM_RECEITA' | 'ENTRADA_SEM_NF' | 'PERDA_SEM_MOTIVO'; produto: string | null; detalhe: string };

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** CNPJ emissor (D-18): o da filial, ou o da empresa quando a filial não tem. */
export async function cnpjEmissor(cliente: any, filialId: string): Promise<string | null> {
    const filial = await cliente.branch.findFirst({ where: { id: filialId }, include: { Company: true } });
    const doc = String(filial?.document || filial?.Company?.document || '').replace(/\D/g, '');
    return doc.length === 14 ? doc : null;
}

export async function montarInventario(
    cliente: any,
    op: { filialId: string; data: Date; cpfTransmissor: string }
): Promise<{ xml: string | null; pendencias: Pendencia[] }> {
    const pendencias: Pendencia[] = [];
    const fimDoDia = new Date(op.data);
    fimDoDia.setHours(23, 59, 59, 999);

    const produtos = await cliente.product.findMany({
        where: { classeSngpc: { not: null } },
        include: { Inventory: { where: { branchId: op.filialId, variantId: null } } },
        orderBy: { name: 'asc' }
    });
    const cnpj = await cnpjEmissor(cliente, op.filialId);
    if (!cnpj) pendencias.push({ codigo: 'SEM_CNPJ', produto: null, detalhe: 'Cadastre o CNPJ da filial ou da empresa.' });

    const entradas: string[] = [];
    for (const p of produtos) {
        const lotes = await cliente.lote.findMany({
            where: { productId: p.id, branchId: op.filialId },
            orderBy: [{ validade: 'asc' }, { lote: 'asc' }]
        });
        // Saldo de cada lote na data do inventário = soma do livro-razão até o fim do dia (D-20 da Fase 1)
        let somaLotes = 0;
        const linhas: { lote: string; qtd: number }[] = [];
        for (const l of lotes) {
            const r = await cliente.loteMovimento.aggregate({ where: { loteId: l.id, createdAt: { lte: fimDoDia } }, _sum: { quantidade: true } });
            const qtd = Math.round(Number(r._sum?.quantidade ?? 0));
            somaLotes += qtd;
            if (qtd > 0) linhas.push({ lote: l.lote, qtd });
        }
        const estoque = (p.Inventory ?? []).reduce((s: number, i: any) => s + i.quantity, 0);
        if (estoque > somaLotes) {
            pendencias.push({ codigo: 'SALDO_SEM_LOTE', produto: p.name, detalhe: `${estoque - somaLotes} unidade(s) sem lote: lance a entrada com lote ou ajuste o estoque.` });
        }
        if (!linhas.length) continue;
        if (!p.registroMS) {
            pendencias.push({ codigo: 'SEM_REGISTRO_MS', produto: p.name, detalhe: 'Cadastre o Registro MS do produto.' });
            continue;
        }
        const classe = CLASSE_TERAPEUTICA[p.classeSngpc as ClasseSngpc];
        for (const l of linhas) {
            entradas.push(`<entradaMedicamentos><medicamentoEntrada><classeTerapeutica>${classe}</classeTerapeutica><registroMSMedicamento>${esc(p.registroMS)}</registroMSMedicamento><numeroLoteMedicamento>${esc(l.lote)}</numeroLoteMedicamento><quantidadeMedicamento>${l.qtd}</quantidadeMedicamento><unidadeMedidaMedicamento>${p.unidadeSngpc ?? 1}</unidadeMedidaMedicamento></medicamentoEntrada></entradaMedicamentos>`);
        }
    }
    if (pendencias.length) return { xml: null, pendencias };

    const xml = '<?xml version="1.0" encoding="iso-8859-1" ?>'
        + '<mensagemSNGPCInventario xmlns="urn:sngpc-schema">'
        + `<cabecalho><cnpjEmissor>${cnpj}</cnpjEmissor><cpfTransmissor>${esc(op.cpfTransmissor)}</cpfTransmissor><data>${iso(op.data)}</data></cabecalho>`
        + `<corpo><medicamentos>${entradas.join('')}</medicamentos><insumos></insumos></corpo>`
        + '</mensagemSNGPCInventario>';
    return { xml, pendencias };
}
