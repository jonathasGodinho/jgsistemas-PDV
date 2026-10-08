import prisma from '../db';
import { moduloAtivo } from './modulos';

export interface ItemCarrinho {
    produtoId: string;
    variantId?: string | null;
    quantidade: number;
    precoUnit: number;
}

export interface DescontoAplicado {
    promocaoId: string;
    nome: string;
    tipo: string;
    produtoId: string;
    variantId: string | null;
    desconto: number;
}

// Calcula os descontos de promoções ativas sobre os itens do carrinho.
// A fonte da verdade é o servidor: as vendas revalidam aqui na finalização.
export const calcularPromocoes = async (
    itens: ItemCarrinho[]
): Promise<{ descontos: DescontoAplicado[]; totalDesconto: number }> => {
    if (!moduloAtivo('precos')) return { descontos: [], totalDesconto: 0 };
    const agora = new Date();
    const promos = await prisma.promotion.findMany({
        where: {
            isActive: true,
            startDate: { lte: agora },
            OR: [{ endDate: null }, { endDate: { gte: agora } }]
        },
        include: { PromotionProduct: true }
    });
    if (promos.length === 0) return { descontos: [], totalDesconto: 0 };

    const ids = [...new Set(itens.map(i => i.produtoId))];
    const produtos = await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, categoryId: true, brandId: true }
    });
    const mapProduto = new Map(produtos.map(p => [p.id, p]));

    const descontos: DescontoAplicado[] = [];
    let totalDesconto = 0;

    for (const item of itens) {
        const produto = mapProduto.get(item.produtoId);
        if (!produto) continue;
        const qtd = Math.max(1, Math.round(Number(item.quantidade) || 1));
        const unit = Number(item.precoUnit) || 0;
        if (unit <= 0) continue;

        for (const promo of promos) {
            if (!promoAplica(promo, produto, item)) continue;
            const desconto = descontoDaPromocao(promo, qtd, unit);
            if (desconto <= 0) continue;
            descontos.push({
                promocaoId: promo.id,
                nome: promo.name,
                tipo: promo.type,
                produtoId: item.produtoId,
                variantId: item.variantId ?? null,
                desconto: Number(desconto.toFixed(2))
            });
            totalDesconto += desconto;
        }
    }

    return { descontos, totalDesconto: Number(totalDesconto.toFixed(2)) };
};

const promoAplica = (promo: any, produto: any, item: any): boolean => {
    switch (promo.scopeType) {
        case 'PRODUCT':
            return promo.PromotionProduct.some((pp: any) =>
                pp.productId === item.produtoId &&
                (!pp.variantId || pp.variantId === item.variantId)
            );
        case 'CATEGORY':
            return !!produto.categoryId && promo.targetCategoryIds.includes(produto.categoryId);
        case 'BRAND':
            return !!produto.brandId && promo.targetBrandIds.includes(produto.brandId);
        case 'ALL':
            return true;
        default:
            return false;
    }
};

const descontoDaPromocao = (promo: any, qtd: number, unit: number): number => {
    const minQtd = Math.max(1, Number(promo.minQuantity ?? 1));
    if (qtd < minQtd) return 0;

    switch (promo.type) {
        case 'LEVE_PAGUE': {
            const comprar = Math.max(1, Number(promo.buyQuantity ?? 1));
            const pagar = Math.min(comprar, Math.max(1, Number(promo.payQuantity ?? comprar)));
            const blocos = Math.floor(qtd / comprar);
            return blocos * (comprar - pagar) * unit;
        }
        case 'BRINDE': {
            const comprar = Math.max(1, Number(promo.buyQuantity ?? 1));
            const gratis = Math.max(1, Number(promo.freeQuantity ?? 1));
            const blocos = Math.floor(qtd / comprar);
            return blocos * gratis * unit;
        }
        case 'DESCONTO_VALOR':
            return Number(promo.discountValue ?? 0);
        case 'DESCONTO_PERCENTUAL':
            return (unit * qtd) * (Number(promo.discountPercent ?? 0) / 100);
        case 'DESCONTO_PROGRESSIVO': {
            const pct = Number(promo.discountPercent ?? 0);
            const niveis = Math.floor(qtd / minQtd);
            const pctTotal = Math.min(90, pct * niveis);
            return (unit * qtd) * (pctTotal / 100);
        }
        default:
            return 0;
    }
};
