// Mensagem de movimentação do SNGPC (farmácia Fase 2; Guia SNGPC v2.3 §4, Figura 2 e exemplo p.12).
// Raiz mensagemSNGPC (urn:sngpc-schema, iso-8859-1): cabeçalho com CNPJ emissor, CPF do RT e
// período; corpo/medicamentos com os blocos na ordem do Guia: entradas, vendas, perdas.
import { Pendencia, cnpjEmissor, iso } from './inventario';
import { blocoVendas } from './xmlVendas';
import { blocosEntradaPerda } from './xmlEntradasPerdas';

export async function montarMovimentacao(
    cliente: any,
    op: { filialId: string; inicio: Date; fim: Date; cpfTransmissor: string }
): Promise<{ xml: string | null; pendencias: Pendencia[] }> {
    const cnpj = await cnpjEmissor(cliente, op.filialId);
    const vendas = await blocoVendas(cliente, op);
    const ep = await blocosEntradaPerda(cliente, op);
    const pendencias: Pendencia[] = [
        ...(cnpj ? [] : [{ codigo: 'SEM_CNPJ' as const, produto: null, detalhe: 'Cadastre o CNPJ da filial ou da empresa.' }]),
        ...ep.pendencias,
        ...vendas.pendencias
    ];
    if (pendencias.length) return { xml: null, pendencias };

    const xml = '<?xml version="1.0" encoding="iso-8859-1" ?>'
        + '<mensagemSNGPC xmlns="urn:sngpc-schema">'
        + `<cabecalho><cnpjEmissor>${cnpj}</cnpjEmissor><cpfTransmissor>${op.cpfTransmissor}</cpfTransmissor>`
        + `<dataInicio>${iso(op.inicio)}</dataInicio><dataFim>${iso(op.fim)}</dataFim></cabecalho>`
        + `<corpo><medicamentos>${ep.entradas.join('')}${vendas.blocos.join('')}${ep.perdas.join('')}</medicamentos><insumos></insumos></corpo>`
        + '</mensagemSNGPC>';
    return { xml, pendencias };
}
