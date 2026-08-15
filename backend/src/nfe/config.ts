import { randomUUID } from 'crypto';
import prisma from '../db';
import { obterSetting, salvarSetting } from '../utils/settings';
import type { NfeConfig } from './types';

export const NFE_CONFIG_KEY = 'nfe_config';
export const QRCODE_HOMOLOGACAO = 'https://sistemas.sefaz.am.gov.br/nfceweb-hom/consultarNFCe.jsp';
export const QRCODE_PRODUCAO = 'https://sistemas.sefaz.am.gov.br/nfceweb/consultarNFCe.jsp';

export const CFOP_PADRAO = '5102';
export const CSOSN_PADRAO = '102';

const PADRAO: NfeConfig = {
    habilitado: false,
    tpAmb: 1,
    serie: '1',
    proximoNumero: 1,
    cfopPadrao: CFOP_PADRAO,
    csosnPadrao: CSOSN_PADRAO,
    csc: '',
    cscId: '',
    qrcodeUrl: QRCODE_PRODUCAO
};

export async function obterNfeConfig(): Promise<NfeConfig> {
    const salvo = await obterSetting<any>(NFE_CONFIG_KEY, {});
    const cfg: NfeConfig = {
        habilitado: salvo.habilitado === true,
        tpAmb: Number(salvo.tpAmb) === 2 ? 2 : 1,
        serie: String(salvo.serie ?? PADRAO.serie).padStart(3, '0'),
        proximoNumero: Math.max(1, Number(salvo.proximoNumero) || PADRAO.proximoNumero),
        cfopPadrao: String(salvo.cfopPadrao ?? PADRAO.cfopPadrao),
        csosnPadrao: String(salvo.csosnPadrao ?? PADRAO.csosnPadrao),
        csc: String(salvo.csc ?? ''),
        cscId: String(salvo.cscId ?? ''),
        qrcodeUrl: String(salvo.qrcodeUrl ?? '')
    };
    return cfg;
}

export function urlQrCode(cfg: NfeConfig): string {
    if (cfg.qrcodeUrl) return cfg.qrcodeUrl;
    return cfg.tpAmb === 2 ? QRCODE_HOMOLOGACAO : QRCODE_PRODUCAO;
}

export async function salvarNfeConfig(dados: Partial<NfeConfig>): Promise<NfeConfig> {
    const atual = await obterNfeConfig();
    const novo: NfeConfig = {
        habilitado: dados.habilitado !== undefined ? Boolean(dados.habilitado) : atual.habilitado,
        tpAmb: Number(dados.tpAmb) === 2 ? 2 : atual.tpAmb,
        serie: String(dados.serie ?? atual.serie).padStart(3, '0'),
        proximoNumero: Math.max(1, Number(dados.proximoNumero) || atual.proximoNumero),
        cfopPadrao: String(dados.cfopPadrao ?? atual.cfopPadrao),
        csosnPadrao: String(dados.csosnPadrao ?? atual.csosnPadrao),
        csc: String(dados.csc ?? atual.csc),
        cscId: String(dados.cscId ?? atual.cscId),
        qrcodeUrl: String(dados.qrcodeUrl ?? atual.qrcodeUrl)
    };
    await salvarSetting(NFE_CONFIG_KEY, novo);
    return novo;
}

export async function reservarNumeroNfe(): Promise<number> {
    const empresa = await prisma.company.findFirst();
    if (!empresa) throw new Error('Nenhuma empresa configurada!');

    return prisma.$transaction(async (tx) => {
        const linhas = await tx.$queryRaw<{ value: any }[]>`
            SELECT value FROM "Setting"
            WHERE key = ${NFE_CONFIG_KEY} AND "companyId" = ${empresa.id}
            FOR UPDATE`;
        let proximo = 1;
        if (linhas.length > 0 && linhas[0]?.value) {
            const v = linhas[0].value;
            const p = typeof v === 'object' && v !== null ? Number((v as any).proximoNumero) : Number(v);
            if (Number.isFinite(p) && p > 0) proximo = p;
        }
        const novo = proximo + 1;
        await tx.$executeRaw`
            INSERT INTO "Setting" (id, "companyId", key, value, "createdAt", "updatedAt")
            VALUES (${cryptoRandomId()}, ${empresa.id}, ${NFE_CONFIG_KEY},
                    ${JSON.stringify({ ...(linhas[0]?.value ?? {}), proximoNumero: novo })}::jsonb,
                    NOW(), NOW())
            ON CONFLICT ("companyId", key) DO UPDATE SET
                value = ${JSON.stringify({ ...(linhas[0]?.value ?? {}), proximoNumero: novo })}::jsonb,
                "updatedAt" = NOW()`;
        return proximo;
    });
}

function cryptoRandomId(): string {
    return randomUUID();
}
