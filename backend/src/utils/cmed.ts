// Importador da planilha de PMC da CMED (Câmara de Regulação do Mercado de Medicamentos).
//
// D-05: a importação SUBSTITUI a tabela inteira da empresa (não faz merge).
// D-18: o CSV tem as colunas `registroMS,descricao,pmc`; linhas sem Registro MS
// ou com preço não numérico são ignoradas (a CMED publica cabeçalho e rodapés).
import prisma from '../db';
import { comEmpresa } from '../tenant';

export type LinhaCmed = {
    registroMS: string;
    descricao: string | null;
    pmc: number;
};

// Lê o CSV da CMED e devolve apenas as linhas utilizáveis.
export function parseCmed(csv: string): LinhaCmed[] {
    const linhas = String(csv ?? '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    const resultado: LinhaCmed[] = [];

    for (const [indice, linha] of linhas.entries()) {
        const colunas = linha.split(',').map((c) => c.trim());
        const [registroMS, descricao, pmcBruto] = colunas;

        // A primeira linha é o cabeçalho ("registroMS,descricao,pmc").
        if (indice === 0 && registroMS.toLowerCase() === 'registroms') continue;

        const pmcTexto = String(pmcBruto ?? '').trim();
        const pmc = Number(pmcTexto.replace(',', '.'));
        if (!registroMS || !pmcTexto || !Number.isFinite(pmc) || pmc < 0) continue;

        resultado.push({ registroMS, descricao: descricao || null, pmc });
    }

    return resultado;
}

// Substitui a tabela CmedPreco da empresa pelas linhas do CSV.
// Devolve quantas linhas foram gravadas.
export async function importarCmed(companyId: string, csv: string): Promise<number> {
    const linhas = parseCmed(csv);

    return comEmpresa(companyId, async () => {
        await prisma.$transaction(async (tx) => {
            await tx.cmedPreco.deleteMany({});
            if (linhas.length > 0) {
                await tx.cmedPreco.createMany({
                    data: linhas.map((l) => ({
                        id: crypto.randomUUID(),
                        companyId,
                        registroMS: l.registroMS,
                        descricao: l.descricao,
                        pmc: l.pmc,
                        updatedAt: new Date()
                    }))
                });
            }
        });

        return linhas.length;
    });
}
