import { randomUUID } from 'crypto';

export interface TaxaResolvida {
    feePercent: number;
    brandId: string | null;
    brandName: string | null;
}

// Resolve a taxa (MDR) de uma operadora para método + parcela + bandeira.
// Prioridade: linha exata da bandeira → linha genérica (brandId nulo) → 0.
export const resolverTaxaCartao = async (
    tx: any,
    operadoraId: string,
    method: 'CREDIT' | 'DEBIT',
    installments: number,
    brandId: string | null
): Promise<TaxaResolvida> => {
    const whereBase: any = {
        operatorId: operadoraId,
        method,
        installments
    };

    let linha = brandId
        ? await tx.cardOperatorFee.findFirst({ where: { ...whereBase, brandId } })
        : null;
    if (!linha) {
        linha = await tx.cardOperatorFee.findFirst({ where: { ...whereBase, brandId: null } });
    }
    if (!linha) {
        return { feePercent: 0, brandId: null, brandName: null };
    }

    const brandName = brandId
        ? ((await tx.cardBrand.findUnique({ where: { id: brandId } }))?.name ?? null)
        : null;

    return {
        feePercent: Number(linha.feePercent ?? 0),
        brandId: linha.brandId ?? null,
        brandName
    };
};

// Gera os recebíveis de cartão para uma venda.
// Crédito: um recebível por parcela (repasse D+ de crédito). Débito: um único.
// Cada recebível gera uma "conta a receber" (FinancialTransaction RECEIVE) vinculada,
// que é o fluxo do módulo Financeiro/Contas a Receber.
// Retorna o total de taxas e o líquido total.
export const criarRecebiveisCartao = async (params: {
    tx: any;
    companyId: string;
    operadoraId: string;
    brandId: string | null;
    method: 'CREDIT' | 'DEBIT';
    installments: number;
    total: number;
    saleId: string;
    dataVenda: Date;
    nfceNumber?: string;
}): Promise<{ recebiveis: any[]; totalTaxa: number; totalLiquido: number }> => {
    const { tx, companyId, operadoraId, brandId, method, installments, total, saleId, dataVenda, nfceNumber } = params;

    const operadora = await tx.cardOperator.findUnique({ where: { id: operadoraId } });
    if (!operadora) {
        throw new Error("Operadora de cartão não encontrada!");
    }

    const qtdRecebiveis = method === 'CREDIT' ? Math.max(1, installments) : 1;
    const diasRepasse = method === 'CREDIT'
        ? Number(operadora.creditSettlementDays ?? 30)
        : Number(operadora.debitSettlementDays ?? 1);

    const totalCents = Math.round(Number(total) * 100);
    const baseCents = Math.floor(totalCents / qtdRecebiveis);
    let restoCents = totalCents - baseCents * qtdRecebiveis;

    const recebiveis: any[] = [];
    let totalTaxa = 0;
    let totalLiquido = 0;

    for (let n = 1; n <= qtdRecebiveis; n++) {
        let valorCents = baseCents;
        if (restoCents > 0) { valorCents += 1; restoCents -= 1; }
        const gross = Number((valorCents / 100).toFixed(2));

        const taxa = await resolverTaxaCartao(tx, operadoraId, method, method === 'CREDIT' ? n : 1, brandId);
        const fee = Number((gross * taxa.feePercent / 100).toFixed(2));
        const net = Number((gross - fee).toFixed(2));

        const vencimento = new Date(dataVenda);
        vencimento.setDate(vencimento.getDate() + diasRepasse);

        const rec = await tx.cardReceivable.create({
            data: {
                id: randomUUID(),
                companyId,
                operatorId: operadoraId,
                saleId,
                brandId: taxa.brandId,
                method,
                installments: qtdRecebiveis,
                installNumber: n,
                grossAmount: gross,
                feeAmount: fee,
                netAmount: net,
                expectedDate: vencimento,
                status: 'PENDING',
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });

        const descricao = `REPASSE CARTÃO ${operadora.name.toUpperCase()} - VENDA ${nfceNumber ?? ''}`.trim();
        await tx.financialTransaction.create({
            data: {
                id: randomUUID(),
                companyId,
                type: 'RECEIVE',
                status: vencimento < new Date() ? 'OVERDUE' : 'PENDING',
                description: descricao,
                amount: net,
                dueDate: vencimento,
                category: 'CARTÃO',
                saleId,
                cardReceivableId: rec.id,
                notes: `${method === 'CREDIT' ? 'CRÉDITO' : 'DÉBITO'} - parcela ${n}/${qtdRecebiveis} do repasse (bruto R$ ${gross.toFixed(2)})`,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });

        recebiveis.push(rec);
        totalTaxa += fee;
        totalLiquido += net;
    }

    return { recebiveis, totalTaxa: Number(totalTaxa.toFixed(2)), totalLiquido: Number(totalLiquido.toFixed(2)) };
};
