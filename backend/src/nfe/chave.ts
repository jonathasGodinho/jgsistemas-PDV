export const CUF_AM = '13';
export const MOD_NFCE = '65';

export function dvModulo11(base: string): number {
    let soma = 0;
    let peso = 2;
    for (let i = base.length - 1; i >= 0; i--) {
        const digito = Number(base[i]);
        if (Number.isNaN(digito)) throw new Error('Base da chave contém caractere inválido');
        soma += digito * peso;
        peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto === 0 || resto === 1 ? 0 : 11 - resto;
}

export function gerarCNF(): string {
    const n = Math.floor(10000000 + Math.random() * 90000000);
    return String(n);
}

export function gerarIdLote(): string {
    return String(Math.floor(Math.random() * 900000000) + 100000000);
}

export interface DadosChave {
    cnpj: string;
    ano: string;
    mes: string;
    serie: string;
    numero: string;
    tpEmis?: string;
}

function apenasDigitos(valor: string): string {
    return valor.replace(/\D/g, '');
}

export function montarChave(dados: DadosChave): { chave: string; cNF: string; cDV: string } {
    const cNF = gerarCNF();
    const tpEmis = apenasDigitos(dados.tpEmis ?? '1');
    const base =
        CUF_AM +
        apenasDigitos(dados.ano).padStart(2, '0') +
        apenasDigitos(dados.mes).padStart(2, '0') +
        apenasDigitos(dados.cnpj).padStart(14, '0') +
        MOD_NFCE +
        apenasDigitos(dados.serie).padStart(3, '0') +
        apenasDigitos(dados.numero).padStart(9, '0') +
        tpEmis +
        cNF;
    if (base.length !== 43) throw new Error(`Chave base inválida (${base.length} dígitos)`);
    const cDV = String(dvModulo11(base));
    return { chave: base + cDV, cNF, cDV };
}

export function idEvento(tpEvento: string, chave: string, seq: number): string {
    return `ID${tpEvento}${chave}${String(seq).padStart(2, '0')}`;
}
