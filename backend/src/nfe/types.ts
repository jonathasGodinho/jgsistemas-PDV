import type { Product, Customer, Company, Sale, SaleItem, SalePayment } from '@prisma/client';

export interface NfeConfig {
    habilitado: boolean;
    tpAmb: number;
    serie: string;
    proximoNumero: number;
    cfopPadrao: string;
    csosnPadrao: string;
    csc: string;
    cscId: string;
    qrcodeUrl: string;
}

export interface Emitente {
    cnpj: string;
    xNome: string;
    xFant: string;
    ender: {
        xLgr: string;
        nro: string;
        xCpl?: string | undefined;
        xBairro: string;
        cMun: string;
        xMun: string;
        UF: string;
        CEP: string;
        fone?: string | undefined;
    };
    IE: string;
    CRT: number;
}

export interface Destinatario {
    cpf?: string | undefined;
    cnpj?: string | undefined;
    xNome?: string | undefined;
    ender?: {
        xLgr: string;
        nro: string;
        xCpl?: string | undefined;
        xBairro: string;
        cMun: string;
        xMun: string;
        UF: string;
        CEP: string;
    } | undefined;
    IE?: string | undefined;
}

export interface ItemFiscal {
    indice: number;
    cProd: string;
    cEAN: string;
    xProd: string;
    ncm: string;
    cest?: string | undefined;
    cfop: string;
    unidade: string;
    quantidade: number;
    vUnit: number;
    vProd: number;
    vDesc: number;
    produto: Product;
}

export interface PagamentoFiscal {
    tPag: string;
    vPag: number;
    indPag: number;
    installments?: number;
}

export interface VendaFiscal {
    chave: string;
    numero: string;
    serie: string;
    cNF: string;
    cDV: string;
    tpAmb: number;
    dhEmi: string;
    itens: ItemFiscal[];
    vProd: number;
    vDesc: number;
    vNF: number;
    pagamentos: PagamentoFiscal[];
    emitente: Emitente;
    destinatario?: Destinatario | undefined;
    idDest: number;
    indFinal: number;
    indPres: number;
    infCpl?: string | undefined;
}

export interface ImpostoItem {
    vItem12741: number;
    icms: { cOrig: number; csosn: string };
    pis: { cst: string; vBC: number; pPIS: number; vPIS: number };
    cofins: { cst: string; vBC: number; pCOFINS: number; vCOFINS: number };
}

export interface Totais {
    vBC: number;
    vICMS: number;
    vICMSDeson: number;
    vFCP: number;
    vBCST: number;
    vST: number;
    vFCPST: number;
    vFCPSTRet: number;
    vProd: number;
    vFrete: number;
    vSeg: number;
    vDesc: number;
    vII: number;
    vIPI: number;
    vPIS: number;
    vCOFINS: number;
    vOutro: number;
    vNF: number;
}

export type VendaCompleta = Sale & {
    SaleItem: (SaleItem & { Product: Product })[];
    SalePayment: SalePayment[];
    Customer?: Customer | null;
    Company?: Company | null;
};

export interface ResultadoEmissao {
    ok: boolean;
    status: string;
    protocolo?: string | undefined;
    recibo?: string | undefined;
    chave?: string | undefined;
    numero?: string | undefined;
    serie?: string | undefined;
    mensagem?: string | undefined;
    xmlEnviado?: string | undefined;
    xmlRetorno?: string | undefined;
}
