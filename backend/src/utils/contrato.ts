// Contrato SaaS de cada empresa: plano, módulos liberados, limites, mensalidade e status.
// Gravado pelo Painel do Administrador na tabela Setting (chave `jg_contrato`).
// Empresa sem contrato gravado = tudo liberado e sem cobrança (instalação própria).
import prisma from '../db';
import { comoSistema } from '../tenant';

export const CHAVE_CONTRATO = 'jg_contrato';

export type Contrato = {
    status: 'ATIVO' | 'SUSPENSO';
    planoId: string | null;
    plano: string | null;            // nome do plano (exibição)
    modulos: string[] | null;        // null = todos
    personalizado: boolean;
    segmento: 'MODA' | 'VAREJO' | 'SALAO';
    limites: { usuarios: number; caixas: number }; // 0 = ilimitado
    valorMensal: number;
    vencimento: string | null;       // AAAA-MM-DD
    toleranciaDias: number;
    diaVencimento: number;           // dia do mês das mensalidades (1 a 28)
    bloqueioAutomatico: boolean;     // bloqueia o acesso após a tolerância
    atualizadoEm?: string;
};

export const CONTRATO_LIVRE: Contrato = {
    status: 'ATIVO', planoId: null, plano: null, modulos: null, personalizado: false,
    segmento: 'MODA', limites: { usuarios: 0, caixas: 0 }, valorMensal: 0, vencimento: null, toleranciaDias: 3, diaVencimento: 10, bloqueioAutomatico: true
};

export function normalizarContrato(v: any): Contrato {
    if (!v || typeof v !== 'object') return { ...CONTRATO_LIVRE };
    return {
        status: v.status === 'SUSPENSO' ? 'SUSPENSO' : 'ATIVO',
        planoId: v.planoId ?? null,
        plano: v.plano ?? null,
        modulos: Array.isArray(v.modulos) ? v.modulos.filter((m: any) => typeof m === 'string') : null,
        personalizado: !!v.personalizado,
        segmento: ['MODA', 'VAREJO', 'SALAO'].includes(v.segmento) ? v.segmento : 'MODA',
        limites: {
            usuarios: Math.max(0, Math.round(Number(v.limites?.usuarios) || 0)),
            caixas: Math.max(0, Math.round(Number(v.limites?.caixas) || 0))
        },
        valorMensal: Math.max(0, Number(v.valorMensal) || 0),
        vencimento: typeof v.vencimento === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.vencimento) ? v.vencimento.slice(0, 10) : null,
        toleranciaDias: v.toleranciaDias !== undefined && v.toleranciaDias !== null && Number.isFinite(Number(v.toleranciaDias)) ? Math.max(0, Math.round(Number(v.toleranciaDias))) : 3,
        diaVencimento: Math.min(28, Math.max(1, Math.round(Number(v.diaVencimento) || 10))),
        bloqueioAutomatico: v.bloqueioAutomatico !== false,
        atualizadoEm: v.atualizadoEm
    };
}

// Cache curto por empresa: várias instâncias serverless convergem em poucos segundos
// depois de uma alteração no painel.
const TTL_MS = 20_000;
const cache = new Map<string, { em: number; contrato: Contrato }>();

export async function lerContrato(companyId: string): Promise<Contrato> {
    const c = cache.get(companyId);
    if (c && Date.now() - c.em < TTL_MS) return c.contrato;
    const linha = await comoSistema(() => prisma.setting.findFirst({ where: { companyId, key: CHAVE_CONTRATO } }));
    const contrato = normalizarContrato(linha?.value);
    cache.set(companyId, { em: Date.now(), contrato });
    return contrato;
}

export function esquecerContrato(companyId: string) {
    cache.delete(companyId);
}

// Situação da mensalidade: em dia, vencida dentro da tolerância (aviso) ou bloqueada.
export function situacaoMensalidade(c: Contrato, agora = new Date()) {
    if (!c.vencimento) return { bloqueado: false, aviso: null as null | { mensagem: string; venceuEm: string; bloqueiaEm: string } };
    const inicio = new Date(`${c.vencimento}T00:00:00-04:00`); // horário de Manaus
    const fim = new Date(inicio.getTime() + c.toleranciaDias * 86400000);
    if (agora.getTime() > fim.getTime()) return { bloqueado: true, aviso: null };
    if (agora.getTime() >= inicio.getTime()) {
        const dias = Math.max(1, Math.ceil((fim.getTime() - agora.getTime()) / 86400000));
        return {
            bloqueado: false,
            aviso: {
                mensagem: `Sua mensalidade venceu em ${inicio.toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' })}. Você tem ${dias} dia(s) para regularizar. Após esse prazo, seu acesso será bloqueado.`,
                venceuEm: inicio.toISOString(),
                bloqueiaEm: fim.toISOString()
            }
        };
    }
    return { bloqueado: false, aviso: null };
}

// Motivo de bloqueio do acesso da empresa (null = liberado).
export function motivoBloqueio(c: Contrato): string | null {
    if (c.status === 'SUSPENSO') return 'O acesso desta empresa está suspenso. Fale com o suporte da JG Sistemas pelo WhatsApp (62) 98219-9003.';
    if (c.bloqueioAutomatico && situacaoMensalidade(c).bloqueado) return 'Mensalidade vencida. Seu acesso foi bloqueado. Fale com o suporte pelo WhatsApp (62) 98219-9003 para regularizar.';
    return null;
}
