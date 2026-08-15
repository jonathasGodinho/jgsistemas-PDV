import { randomUUID } from 'crypto';

// ==================== PARSER DE EXTRATO DE OPERADORA ====================
// O extrato pode ser CSV (vírgula ou ponto-e-vírgula), TSV ou texto livre.
// Estratégia robusta: para cada linha, procura uma data dd/mm/aaaa, um valor
// monetário e uma referência (NSU/REF/Nº), montando a descrição com o resto.

export interface LinhaExtrato {
    numeroLinha: number;
    data: Date;
    descricao: string;
    referencia: string | null;
    valor: number;
    raw: string;
}

const REG_DATA = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
const REG_VALOR = /R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+)/i;
const REG_NUM_FINAL = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*$/;
const REG_REFERENCIA = /(?:NSU|REF|REF\.? ?|N[º°]?|COD(?:IGO)?|DOC)\s*[:.-]?\s*([A-Za-z0-9\-/]+)/i;

export const normalizarNumero = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isNaN(v) ? null : v;
    let s = String(v).trim();
    s = s.replace(/R\$\s?/gi, '').replace(/\s/g, '');
    if (s === '') return null;
    const temVirgula = s.includes(',');
    const temPonto = s.includes('.');
    if (temVirgula) {
        if (temPonto) {
            // 1.234,56 → remove pontos (separador de milhar)
            const [inteiro, ...resto] = s.split('.');
            s = inteiro + '.' + resto.join('').replace(',', '.');
        } else {
            s = s.replace(',', '.');
        }
    }
    const n = Number(s);
    return isNaN(n) ? null : n;
};

// Converte "01/02/2026" em Date no fuso local (evita deslocamento do UTC).
const parseDataBr = (s: string): Date | null => {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : d;
};

const limparDescricao = (s: string): string =>
    s.replace(REG_DATA, ' ').replace(REG_VALOR, ' ').replace(/\s+/g, ' ').trim();

// Interpreta uma linha do extrato. Retorna null se a linha não for um lançamento.
const interpretarLinha = (linha: string, numeroLinha: number): LinhaExtrato | null => {
    const texto = linha.trim();
    if (!texto || /^(data|DATA|lançamento|LANÇAMENTO|descricao|descrição|referencia|valor|extrato|extrato de)/.test(texto)) {
        return null;
    }

    const datas = [...texto.matchAll(REG_DATA)];
    if (datas.length === 0) return null;

    const dataBr = datas[0][0];
    const data = parseDataBr(dataBr);
    if (!data) return null;

    // Valor: prefere "R$ 1.234,56"; senão, número no fim da linha.
    let valor: number | null = null;
    const mValor = texto.match(REG_VALOR);
    if (mValor) {
        valor = normalizarNumero(mValor[1]);
    } else {
        const mFinal = texto.match(REG_NUM_FINAL);
        if (mFinal) valor = normalizarNumero(mFinal[1]);
    }
    if (valor === null || valor < 0) return null;

    const mRef = texto.match(REG_REFERENCIA);
    const referencia = mRef ? mRef[1].trim() : null;

    return {
        numeroLinha,
        data,
        descricao: limparDescricao(texto),
        referencia,
        valor,
        raw: texto
    };
};

// Faz o parse do conteúdo bruto do extrato, retornando apenas lançamentos válidos.
export const parseExtrato = (texto: string): LinhaExtrato[] => {
    const linhas = String(texto ?? '')
        .replace(/\r\n/g, '\n')
        .split('\n');

    const saida: LinhaExtrato[] = [];
    linhas.forEach((linha, i) => {
        const lancamento = interpretarLinha(linha, i + 1);
        if (lancamento) saida.push(lancamento);
    });
    return saida;
};

// ==================== MATCH COM RECEBÍVEIS ====================

export interface MatchRecebivelParams {
    tx: any;
    companyId: string;
    operatorId: string;
    valor: number;
    data: Date;
    faixaDias?: number; // janela ao redor da data do extrato p/ comparar com expectedDate
}

// Procura um recebível PENDING candidato: mesmo valor líquido, mesma operadora,
// vencimento (D+) próximo da data do lançamento do extrato. Prioriza os que
// vencem no mesmo dia da data do extrato; depois os mais próximos.
export const procurarRecebivel = async (p: MatchRecebivelParams) => {
    const { tx, companyId, operatorId, valor, data } = p;
    const faixaDias = p.faixaDias ?? 7;

    const de = new Date(data);
    de.setDate(de.getDate() - faixaDias);
    const ate = new Date(data);
    ate.setDate(ate.getDate() + faixaDias);

    const candidatos = await tx.cardReceivable.findMany({
        where: {
            companyId,
            operatorId,
            status: 'PENDING',
            netAmount: valor,
            expectedDate: { gte: de, lte: ate }
        },
        orderBy: [{ expectedDate: 'asc' }, { createdAt: 'asc' }]
    });

    if (candidatos.length === 0) return null;

    // Preferência: mesmo dia exato; senão, o mais próximo da data do extrato.
    const mesmoDia = candidatos.find((r: any) => {
        const e = new Date(r.expectedDate);
        return e.getFullYear() === data.getFullYear()
            && e.getMonth() === data.getMonth()
            && e.getDate() === data.getDate();
    });
    return mesmoDia ?? candidatos[0];
};

// Cria (no escopo de uma transação) um import com as linhas e já tenta o match.
export const criarImportacao = async (params: {
    tx: any;
    companyId: string;
    operatorId: string;
    fileName?: string;
    conteudo: string;
    createdById?: string;
    notas?: string;
}): Promise<{ importId: string; total: number; matcheados: number; naoMatcheados: number; creditAmount: number; linhas: any[] }> => {
    const { tx, companyId, operatorId, conteudo } = params;
    const linhas = parseExtrato(conteudo);
    if (linhas.length === 0) {
        throw new Error("Nenhum lançamento válido encontrado no extrato! Confira o formato (data, descrição, valor).");
    }

    const datas = linhas.map(l => l.data.getTime());
    const periodStart = new Date(Math.min(...datas));
    const periodEnd = new Date(Math.max(...datas));
    const creditAmount = Number(linhas.reduce((s, l) => s + l.valor, 0).toFixed(2));

    const importId = randomUUID();
    const criado = await tx.cardStatementImport.create({
        data: {
            id: importId,
            companyId,
            operatorId,
            fileName: params.fileName || null,
            periodStart,
            periodEnd,
            status: 'OPEN',
            totalLines: linhas.length,
            matchedLines: 0,
            unmatchedLines: linhas.length,
            creditAmount,
            notes: params.notas || null,
            createdById: params.createdById || null,
            createdAt: new Date(),
            updatedAt: new Date()
        }
    });
    void criado;

    let matcheados = 0;
    const linhasCriadas: any[] = [];
    for (const linha of linhas) {
        const recebivel = await procurarRecebivel({
            tx,
            companyId,
            operatorId,
            valor: linha.valor,
            data: linha.data
        });
        const matched = !!recebivel;
        if (matched) matcheados += 1;

        const nova = await tx.cardStatementLine.create({
            data: {
                id: randomUUID(),
                importId,
                operatorId,
                lineNumber: linha.numeroLinha,
                statementDate: linha.data,
                description: linha.descricao || null,
                reference: linha.referencia,
                amount: linha.valor,
                matchedReceivableId: recebivel?.id ?? null,
                status: matched ? 'MATCHED' : 'UNMATCHED',
                notes: matched ? 'Conciliado automaticamente' : null,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });
        linhasCriadas.push(nova);
    }

    await tx.cardStatementImport.update({
        where: { id: importId },
        data: {
            matchedLines: matcheados,
            unmatchedLines: linhas.length - matcheados,
            updatedAt: new Date()
        }
    });

    return {
        importId,
        total: linhas.length,
        matcheados,
        naoMatcheados: linhas.length - matcheados,
        creditAmount,
        linhas: linhasCriadas
    };
};
