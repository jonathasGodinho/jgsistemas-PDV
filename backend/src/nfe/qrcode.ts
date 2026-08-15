import { createHash } from 'crypto';

export interface DadosQrCode {
    chave: string;
    tpAmb: number;
    cscId: string;
    csc: string;
    urlBase: string;
    tpEmis?: number;
    dhEmi?: string;
    vNF?: number;
    digVal?: string;
}

/**
 * Monta a URL do QR Code da NFC-e (versão 2.0, NT 2015.002).
 *
 * Online (tpEmis != 9):
 *   <url>?p=<chave>|2|<tpAmb>|<idCSC>|<hash>
 *   hash = SHA1(<chave>|2|<tpAmb>|<idCSC> + CSC) em hexadecimal maiúsculo
 *
 * Offline (tpEmis = 9):
 *   <url>?p=<chave>|2|<tpAmb>|<dhEmi_hex>|<vNF>|<digVal_hex>|<idCSC>|<hash>
 */
export function montarQrCode(dados: DadosQrCode): string {
    const versao = '2';
    const cscId = String(Number(dados.cscId)).trim();
    const csc = dados.csc.trim();
    const online = (dados.tpEmis ?? 1) !== 9;

    if (!dados.csc || !dados.cscId) {
        throw new Error('CSC/CSCId não configurados. Solicite o token CSC junto à SEFAZ-AM e configure em Configurações > Cupom Fiscal.');
    }

    let payload: string;
    if (online) {
        payload = `${dados.chave}|${versao}|${dados.tpAmb}|${cscId}`;
    } else {
        if (!dados.dhEmi || dados.vNF === undefined || !dados.digVal) {
            throw new Error('Dados insuficientes para QR Code em contingência offline.');
        }
        const dhHex = Buffer.from(dados.dhEmi, 'utf8').toString('hex');
        const digHex = Buffer.from(dados.digVal, 'utf8').toString('hex');
        const vNF = dados.vNF.toFixed(2);
        payload = `${dados.chave}|${versao}|${dados.tpAmb}|${dhHex}|${vNF}|${digHex}|${cscId}`;
    }

    const hash = createHash('sha1').update(payload + csc).digest('hex').toUpperCase();
    const base = dados.urlBase.includes('?') ? dados.urlBase : `${dados.urlBase}?p=`;
    return `${base}${payload}|${hash}`;
}

export function urlChave(dados: { urlBase: string; chave: string }): string {
    const base = dados.urlBase.split('?')[0] || dados.urlBase;
    return `${base}?chNFe=${dados.chave}`;
}
