import type { Product } from '@prisma/client';
import type { GrupoCofins, GrupoPis, IcmsSTItem, ImpostoItem, NfeConfig } from './types';

const CSOSN_VALIDOS = ['101', '102', '103', '500', '900'];

/** CST de PIS/COFINS não tributado (04/05 monofásica, 06 alíquota zero, 07 isenta, 08 sem incidência, 09 suspensão). */
const CST_NAO_TRIBUTADO = ['04', '05', '06', '07', '08', '09'];

/** CST efetivamente monofásico em PIS/COFINS: 04 (revenda) e 05 (produção própria). */
const CST_MONOFASICO = ['04', '05'];

/**
 * CST define o GRUPO do XML: emitir CST 04 dentro de `PISOutr` é rejeitado pela
 * SEFAZ. CST 03 (por quantidade) não é suportado por falta de `qBCProd`.
 */
export function grupoPis(cst: string): GrupoPis {
    if (cst === '01' || cst === '02') return 'PISAliq';
    if (CST_NAO_TRIBUTADO.includes(cst)) return 'PISNT';
    return 'PISOutr';
}

export function grupoCofins(cst: string): GrupoCofins {
    if (cst === '01' || cst === '02') return 'COFINSAliq';
    if (CST_NAO_TRIBUTADO.includes(cst)) return 'COFINSNT';
    return 'COFINSOutr';
}

/** D-10: o produto é medicamento quando tem tipo cadastrado (Referência/Genérico/Similar/Outros). */
export function ehMedicamento(produto: Pick<Product, 'tipoMedicamento'>): boolean {
    return Boolean(produto.tipoMedicamento);
}

export function arredondar(v: number): number {
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

export function calcImpostoItem(
    valorBase: number,
    produto: Product,
    cfg: NfeConfig
): ImpostoItem {
    const csosn = (produto.csosn && CSOSN_VALIDOS.includes(produto.csosn)) ? produto.csosn : cfg.csosnPadrao;
    const csosnFinal = CSOSN_VALIDOS.includes(csosn) ? csosn : '102';

    const base = arredondar(valorBase);

    // D-12/fiscal-nfce: medicamento de revenda é monofásico — CST 04 e alíquota
    // zero. O cadastro do produto manda quando preenchido.
    const medicamento = ehMedicamento(produto);
    const cstPadrao = medicamento ? CST_MONOFASICO[0] : '49';

    const pisCst = produto.pisCst ?? cstPadrao;
    const pisAliq = Number(produto.pisAliq ?? 0);
    const cofinsCst = produto.cofinsCst ?? cstPadrao;
    const cofinsAliq = Number(produto.cofinsAliq ?? 0);

    const pis = {
        cst: pisCst,
        grupo: grupoPis(pisCst),
        vBC: base,
        pPIS: pisAliq,
        vPIS: arredondar((base * pisAliq) / 100)
    };
    const cofins = {
        cst: cofinsCst,
        grupo: grupoCofins(cofinsCst),
        vBC: base,
        pCOFINS: cofinsAliq,
        vCOFINS: arredondar((base * cofinsAliq) / 100)
    };

    // "Monofásico" é o regime efetivamente aplicado ao item, não apenas o cadastro
    // de medicamento: medicamento cadastrado com CST tributado (01/02) não é monofásico.
    const monofasico = CST_MONOFASICO.includes(pisCst) || CST_MONOFASICO.includes(cofinsCst);

    // ICMS-ST (D-12): MVA e redução da base são cadastradas no produto. Sem MVA
    // cadastrada não há ST a restituir (o campo fica ausente).
    const st = calcSt(base, produto, csosnFinal);

    return {
        vItem12741: 0,
        monofasico,
        icms: { cOrig: 0, csosn: csosnFinal, st },
        pis,
        cofins
    };
}

/**
 * ICMS-ST restituído (CSOSN 500) a partir da MVA e da redução cadastradas no
 * produto (D-12):
 *
 *   vBCST   = base * (1 - redução/100) * (1 + MVA/100)
 *   vICMSST = vBCST * alíquota - ICMS próprio   (nunca negativo)
 */
function calcSt(base: number, produto: Product, csosn: string): IcmsSTItem | undefined {
    const mva = Number(produto.mvaSt ?? 0);
    const reducao = Number(produto.reducaoSt ?? 0);
    const aliquota = Number(produto.icmsAliq ?? 0);
    if (csosn !== '500' || !(mva > 0) || !(aliquota > 0)) return undefined;

    const baseST = arredondar(base * (1 - reducao / 100) * (1 + mva / 100));
    const icmsProprio = arredondar((base * aliquota) / 100);
    const vICMSST = arredondar(Math.max(0, (baseST * aliquota) / 100 - icmsProprio));

    return {
        vBCST: baseST,
        pMVAST: mva,
        pRedBCST: reducao,
        pICMSST: aliquota,
        vICMSST
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
