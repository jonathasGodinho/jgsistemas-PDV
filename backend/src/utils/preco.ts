import prisma from '../db';
import { moduloAtivo } from './modulos';

export const precoBaseDe = (produto: any, variante?: any): number =>
    variante ? Number(variante.salePrice ?? produto.salePrice) : Number(produto.salePrice);

// Aplica a tabela de preço (do cliente ou padrão) sobre o preço base.
// Retorna null quando não há regra → o chamador usa o preço base.
export const resolverPreco = async (
    produtoId: string,
    varianteId: string | null,
    clienteId: string | null,
    quantidade: number,
    precoBase: number
): Promise<number | null> => {
    if (!moduloAtivo('precos')) return null;
    let tabelaId: string | null = null;

    if (clienteId) {
        const cliente = await prisma.customer.findUnique({
            where: { id: clienteId },
            select: { priceTableId: true }
        });
        if (cliente?.priceTableId) {
            const t = await prisma.priceTable.findFirst({
                where: { id: cliente.priceTableId, isActive: true }
            });
            if (t) tabelaId = t.id;
        }
    }

    if (!tabelaId) {
        const padrao = await prisma.priceTable.findFirst({
            where: { isDefault: true, isActive: true }
        });
        if (padrao) tabelaId = padrao.id;
    }

    if (!tabelaId) return null;

    const itens = await prisma.priceTableItem.findMany({
        where: { priceTableId: tabelaId, productId: produtoId }
    });
    if (itens.length === 0) return null;

    // Prefere a linha da variante; senão a linha base do produto
    let linhas = varianteId ? itens.filter(i => i.variantId === varianteId) : [];
    if (linhas.length === 0) linhas = itens.filter(i => !i.variantId);
    if (linhas.length === 0) return null;

    // Regra de quantidade: usa a maior minQuantity menor/igual à quantidade (ou sem restrição)
    const aplicaveis = linhas.filter(i => !i.minQuantity || quantidade >= i.minQuantity);
    if (aplicaveis.length === 0) return null;
    const item = aplicaveis.sort((a: any, b: any) => (b.minQuantity ?? 0) - (a.minQuantity ?? 0))[0];

    if (item.price !== null && item.price !== undefined) return Number(item.price);
    if (item.percentAdjust !== null && item.percentAdjust !== undefined) {
        return Number((precoBase * (1 + Number(item.percentAdjust) / 100)).toFixed(2));
    }
    return null;
};
