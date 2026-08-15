import { DOMParser, type Document, type Element } from '@xmldom/xmldom';

export const NS_NFE = 'http://www.portalfiscal.inf.br/nfe';

export function xmlParaDoc(xml: string): Document {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (!doc.documentElement) {
        throw new Error('Resposta da SEFAZ vazia ou inválida.');
    }
    return doc;
}

export function primeiro(doc: Document, tagLocal: string): string | undefined {
    const no = doc.getElementsByTagNameNS(NS_NFE, tagLocal)[0];
    return textoDoNo(no);
}

export function primeiroDentro(doc: Document, paiLocal: string, tagLocal: string): string | undefined {
    const pai = doc.getElementsByTagNameNS(NS_NFE, paiLocal)[0];
    if (!pai) return undefined;
    const no = pai.getElementsByTagNameNS(NS_NFE, tagLocal)[0];
    return textoDoNo(no);
}

export function existe(doc: Document, tagLocal: string): boolean {
    return doc.getElementsByTagNameNS(NS_NFE, tagLocal).length > 0;
}

function textoDoNo(no: Element | undefined): string | undefined {
    if (!no) return undefined;
    const t = no.textContent;
    if (t === null || t === undefined || t.trim() === '') return undefined;
    return t.trim();
}

export function extrairQrCode(xml: string | null | undefined): string | undefined {
    if (!xml) return undefined;
    const m = xml.match(/<qrCode[^>]*>([\s\S]*?)<\/qrCode>/i);
    if (!m || !m[1]) return undefined;
    return m[1]
        .trim()
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}
