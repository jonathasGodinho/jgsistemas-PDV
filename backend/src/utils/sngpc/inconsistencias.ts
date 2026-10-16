// Inconsistência do SNGPC (farmácia Fase 2; D-05, RDC 22/2014 art. 14).
// O padrão XML não tem operação de estorno de venda: quando uma venda com item SNGPC já entrou
// num arquivo de movimentação exportado e depois é cancelada ou devolvida, o estoque e o lote
// voltam (D-20 da Fase 1) e fica registrada uma inconsistência para o RT notificar no portal.
import { randomUUID } from 'crypto';

function diaInicio(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

/**
 * Registra a inconsistência se a venda tem item SNGPC e a data dela está dentro de um arquivo
 * de MOVIMENTACAO já gerado para a filial. Devolve a inconsistência criada, ou null.
 */
export async function registrarSeExportada(
    tx: any,
    venda: { id: string; companyId: string; branchId: string; createdAt: Date; nfceNumber?: string | null },
    acao: 'CANCELAMENTO' | 'DEVOLUCAO'
) {
    const itensSngpc = await tx.saleItem.count({
        where: { saleId: venda.id, variantId: null, Product: { classeSngpc: { not: null } } }
    });
    if (!itensSngpc) return null;

    const dia = diaInicio(venda.createdAt);
    const arquivo = await tx.sngpcArquivo.findFirst({
        where: { branchId: venda.branchId, tipo: 'MOVIMENTACAO', dataInicio: { lte: dia }, dataFim: { gte: dia } },
        orderBy: { createdAt: 'desc' }
    });
    if (!arquivo) return null;

    const verbo = acao === 'CANCELAMENTO' ? 'cancelada' : 'com devolução';
    return tx.sngpcInconsistencia.create({
        data: {
            id: randomUUID(),
            companyId: venda.companyId,
            branchId: venda.branchId,
            saleId: venda.id,
            arquivoId: arquivo.id,
            descricao: `Venda ${venda.nfceNumber ?? venda.id} ${verbo} depois de exportada no SNGPC (arquivo de ${dia.toISOString().slice(0, 10)}): notificar a inconsistência no portal.`,
            status: 'ABERTA',
            createdAt: new Date()
        }
    });
}
