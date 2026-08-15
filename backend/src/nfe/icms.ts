import type { Product } from '@prisma/client';
import type { NfeConfig } from './types';

const CSOSN_VALIDOS = ['101', '102', '103', '500', '900'];

export function arredondar(v: number): number {
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

export interface ImpostoItem {
    vItem12741: number;
    icms: { cOrig: number; csosn: string };
    pis: { cst: string; vBC: number; pPIS: number; vPIS: number };
    cofins: { cst: string; vBC: number; pCOFINS: number; vCOFINS: number };
}

export function calcImpostoItem(
    valorBase: number,
    produto: Product,
    cfg: NfeConfig
): ImpostoItem {
    const csosn = (produto.csosn && CSOSN_VALIDOS.includes(produto.csosn)) ? produto.csosn : cfg.csosnPadrao;
    const csosnFinal = CSOSN_VALIDOS.includes(csosn) ? csosn : '102';

    const base = arredondar(valorBase);

    const pisCst = produto.pisCst ?? '49';
    const pisAliq = Number(produto.pisAliq ?? 0);
    const cofinsCst = produto.cofinsCst ?? '49';
    const cofinsAliq = Number(produto.cofinsAliq ?? 0);

    const pis = {
        cst: pisCst,
        vBC: base,
        pPIS: pisAliq,
        vPIS: arredondar((base * pisAliq) / 100)
    };
    const cofins = {
        cst: cofinsCst,
        vBC: base,
        pCOFINS: cofinsAliq,
        vCOFINS: arredondar((base * cofinsAliq) / 100)
    };

    return {
        vItem12741: 0,
        icms: { cOrig: 0, csosn: csosnFinal },
        pis,
        cofins
    };
}

export function mapTPag(metodo: string): string {
    switch (metodo) {
        case 'MONEY':
            return '01';
        case 'PIX':
            return '17';
        case 'CREDIT_CARD':
            return '03';
        case 'DEBIT_CARD':
            return '04';
        default:
            return '99';
    }
}

export function mapIndPag(installments: number | undefined): string {
    return installments && installments > 1 ? '1' : '0';
}

export function indIEDest(cliente: { stateReg?: string | null; cpf?: string | null }): string {
    if (cliente.stateReg) return '1';
    return '9';
}
