import { readFile } from 'fs/promises';
import { request as httpRequest, type ClientRequestArgs } from 'http';
import { request as httpsRequest, type RequestOptions } from 'https';
import type { Duplex } from 'stream';

export const SERVICOS = {
    AUTORIZACAO: 'NfeAutorizacao4',
    RET_AUTORIZACAO: 'NfeRetAutorizacao4',
    CONSULTA: 'NfeConsulta4',
    RECEPCAO_EVENTO: 'RecepcaoEvento4'
} as const;

export type ServicoNfe = (typeof SERVICOS)[keyof typeof SERVICOS];

const BASES: Record<number, string> = {
    2: 'https://homnfce.sefaz.am.gov.br/nfce-services/services',
    1: 'https://nfce.sefaz.am.gov.br/nfce-services/services'
};

export function urlServico(servico: ServicoNfe, tpAmb: number): string {
    const base = BASES[tpAmb] ?? BASES[1] ?? '';
    return `${base}/${servico}`;
}

export function envelopeSoap(conteudo: string): string {
    return (
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
        'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
        'xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">' +
        '<soap12:Body>' +
        '<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe">' +
        conteudo +
        '</nfeDadosMsg>' +
        '</soap12:Body>' +
        '</soap12:Envelope>'
    );
}

interface OpcoesTls {
    pfx?: Buffer;
    passphrase?: string;
    rejectUnauthorized?: boolean;
}

async function tlsOpcoes(): Promise<OpcoesTls> {
    const pfx = process.env.NFE_CERT_PFX;
    if (pfx) {
        return {
            pfx: await readFile(pfx),
            passphrase: process.env.NFE_CERT_PASSWORD ?? ''
        };
    }
    return { rejectUnauthorized: process.env.NFE_TLS_INSECURE !== '1' };
}

function criarConectorProxy(proxy: URL) {
    return (opcoes: ClientRequestArgs, callback: (err: Error | null, socket?: Duplex) => void): undefined => {
        const host = opcoes.hostname ?? '';
        const porta = String(opcoes.port || 443);
        const conecta = httpRequest({
            host: proxy.hostname,
            port: Number(proxy.port || 8080),
            method: 'CONNECT',
            path: `${host}:${porta}`
        });
        conecta.on('connect', (res, socket) => {
            if (res.statusCode !== 200) {
                callback(new Error(`Falha no túnel CONNECT do proxy: ${res.statusCode}`));
                socket.destroy();
                return;
            }
            callback(null, socket);
        });
        conecta.on('error', (e) => callback(e));
        conecta.end();
        return undefined;
    };
}

export interface RespostaSoap {
    statusCode?: number | undefined;
    body: string;
}

let ultimaChaveSimulada = '';

function simularResposta(servico: ServicoNfe, conteudo: string): string {
    const ns = 'http://www.portalfiscal.inf.br/nfe';
    const agora = new Date().toISOString();

    const chaveDoConteudo = conteudo.match(/NFe(\d{44})/)?.[1] ?? conteudo.match(/<chNFe>(\d{44})<\/chNFe>/)?.[1];
    if (chaveDoConteudo) ultimaChaveSimulada = chaveDoConteudo;

    if (servico === SERVICOS.AUTORIZACAO) {
        return (
            `<retEnviNFe xmlns="${ns}" versao="4.00"><tpAmb>2</tpAmb><verAplic>JG_DRY_RUN</verAplic>` +
            `<cStat>103</cStat><xMotivo>Lote recebido com sucesso</xMotivo><cUF>13</cUF>` +
            `<nRec>dry-run-recibo-1</nRec></retEnviNFe>`
        );
    }
    if (servico === SERVICOS.RET_AUTORIZACAO) {
        return (
            `<retConsReciNFe xmlns="${ns}" versao="4.00"><tpAmb>2</tpAmb><verAplic>JG_DRY_RUN</verAplic>` +
            `<nRec>dry-run-recibo-1</nRec><cStat>100</cStat><xMotivo>Lote processado</xMotivo><cUF>13</cUF>` +
            `<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>JG_DRY_RUN</verAplic>` +
            `<chNFe>${ultimaChaveSimulada}</chNFe><dhRecbto>${agora}</dhRecbto>` +
            `<nProt>113999999999999</nProt><digVal>ZGF0YQ==</digVal>` +
            `<cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></retConsReciNFe>`
        );
    }
    if (servico === SERVICOS.RECEPCAO_EVENTO) {
        return (
            `<retEnvEvento xmlns="${ns}" versao="1.00"><idLote>1</idLote><tpAmb>2</tpAmb>` +
            `<verAplic>JG_DRY_RUN</verAplic><cOrgao>13</cOrgao><cStat>128</cStat>` +
            `<xMotivo>Lote de evento processado</xMotivo><retEvento versao="1.00"><infEvento>` +
            `<tpAmb>2</tpAmb><verAplic>JG_DRY_RUN</verAplic><cOrgao>13</cOrgao><cStat>135</cStat>` +
            `<xMotivo>Evento registrado e vinculado a NF-e</xMotivo><chNFe>${ultimaChaveSimulada}</chNFe>` +
            `<tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><dhRegEvento>${agora}</dhRegEvento>` +
            `<nProt>113999999999999</nProt></infEvento></retEvento></retEnvEvento>`
        );
    }
    return (
        `<retConsSitNFe xmlns="${ns}" versao="4.00"><tpAmb>2</tpAmb><verAplic>JG_DRY_RUN</verAplic>` +
        `<cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></retConsSitNFe>`
    );
}

function enviarHttps(opcoes: RequestOptions, corpo: string): Promise<RespostaSoap> {
    return new Promise((resolve, reject) => {
        const req = httpsRequest(opcoes, (res) => {
            const pedacos: Buffer[] = [];
            res.on('data', (c) => pedacos.push(Buffer.from(c)));
            res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(pedacos).toString('utf8') }));
        });
        req.on('error', reject);
        req.setTimeout(30000, () => req.destroy(new Error('Timeout ao comunicar com a SEFAZ')));
        req.end(corpo);
    });
}

export async function chamarSoap(servico: ServicoNfe, tpAmb: number, conteudo: string): Promise<RespostaSoap> {
    if (process.env.NFE_DRY_RUN === '1') {
        return { statusCode: 200, body: simularResposta(servico, conteudo) };
    }
    const url = new URL(urlServico(servico, tpAmb));
    const tls = await tlsOpcoes();
    const opcoes: RequestOptions = {
        method: 'POST',
        hostname: url.hostname,
        port: Number(url.port || 443),
        path: url.pathname,
        headers: {
            'Content-Type': 'application/soap+xml; charset=utf-8;',
            Accept: 'application/soap+xml, text/xml, */*',
            'User-Agent': 'JG ERP/1.0'
        },
        ...tls
    };
    const proxyUrl = process.env.NFE_PROXY_URL;
    if (proxyUrl) {
        opcoes.createConnection = criarConectorProxy(new URL(proxyUrl)) as RequestOptions['createConnection'];
    }
    return enviarHttps(opcoes, envelopeSoap(conteudo));
}
