// Módulos do ERP liberados para esta instalação.
//
// Quem decide é o Painel do Administrador (SaaS): ele grava um JSON por cliente e
// inicia a instância com JG_MODULOS_ARQUIVO apontando para esse arquivo. O arquivo
// é relido quando muda (mtime), então liberar/bloquear um módulo vale na hora, sem
// reiniciar a instância. Sem a variável (desenvolvimento local), tudo fica liberado.
import fs from 'fs';
import path from 'path';
import { contextoAtual } from '../tenant';

export type ModuloDef = {
    chave: string;
    nome: string;
    grupo: string;
    descricao: string;
    paginas: string[];   // páginas .html do módulo
    apis: string[];      // prefixos de API exclusivos do módulo (bloqueados com 403)
    icone?: string;
    futuro?: boolean;    // ainda não implementado no ERP (aparece como "em breve")
};

// Catálogo compartilhado com o Painel do Administrador (backend/modulos.json).
// Módulos essenciais não entram no catálogo: estão sempre ativos.
export const CATALOGO: ModuloDef[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'modulos.json'), 'utf8')
).modulos;

export const TODAS_AS_CHAVES = CATALOGO.map(m => m.chave);

type Liberacao = {
    liberados: string[] | null; // null = tudo liberado
    segmento?: string | null;
    plano?: string | null;
    limites?: Record<string, number> | null;
};

let cache: { mtime: number; dados: Liberacao } | null = null;

// Lê a liberação atual. Na nuvem (multiempresa) vem do contrato da empresa do
// operador logado; na instalação local, do arquivo/variável (com cache por mtime).
export function liberacaoAtual(): Liberacao {
    const ctx = contextoAtual();
    if (ctx && ctx.contrato) {
        return {
            liberados: ctx.contrato.modulos,
            segmento: ctx.contrato.segmento,
            plano: ctx.contrato.plano,
            limites: ctx.contrato.limites
        };
    }
    const arquivo = process.env.JG_MODULOS_ARQUIVO;
    if (!arquivo) {
        const env = process.env.JG_MODULOS;
        if (env) return { liberados: env.split(',').map(s => s.trim()).filter(Boolean) };
        return { liberados: null };
    }
    try {
        const st = fs.statSync(arquivo);
        if (cache && cache.mtime === st.mtimeMs) return cache.dados;
        const json = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
        const dados: Liberacao = {
            liberados: Array.isArray(json.modulos) ? json.modulos.filter((m: any) => typeof m === 'string') : null,
            segmento: json.segmento ?? null,
            plano: json.plano ?? null,
            limites: json.limites ?? null
        };
        cache = { mtime: st.mtimeMs, dados };
        return dados;
    } catch (e) {
        // Arquivo configurado mas ilegível: bloqueia só os módulos (núcleo continua funcionando).
        return { liberados: [] };
    }
}

export function moduloAtivo(chave: string): boolean {
    const { liberados } = liberacaoAtual();
    return liberados === null || liberados.includes(chave);
}

function moduloDoCaminho(caminho: string, campo: 'paginas' | 'apis'): ModuloDef | undefined {
    const p = caminho.toLowerCase();
    return CATALOGO.find(m => m[campo].some(x => campo === 'paginas' ? p === x : (p === x || p.startsWith(x + '/') || p.startsWith(x + '?'))));
}

// Módulo bloqueado que atende a API (ou null se liberada). Usado na autenticação,
// quando já se sabe a empresa do operador.
export function moduloBloqueadoDaApi(caminho: string): ModuloDef | null {
    const { liberados } = liberacaoAtual();
    if (liberados === null) return null;
    const m = moduloDoCaminho(caminho, 'apis');
    return m && !liberados.includes(m.chave) ? m : null;
}

// Middleware: barra APIs exclusivas de módulos bloqueados (403) e páginas .html
// de módulos bloqueados (redireciona para o Início, que mostra o aviso).
export function exigirModulos(req: any, res: any, next: any) {
    const { liberados } = liberacaoAtual();
    if (liberados === null) return next();
    const caminho = String(req.path || '');
    if (caminho.startsWith('/api/')) {
        const m = moduloDoCaminho(caminho, 'apis');
        if (m && !liberados.includes(m.chave)) {
            return res.status(403).json({ erro: `O módulo "${m.nome}" não está liberado no seu plano.`, modulo: m.chave });
        }
        return next();
    }
    if (caminho.endsWith('.html')) {
        const m = moduloDoCaminho(caminho, 'paginas');
        if (m && !liberados.includes(m.chave)) {
            return res.redirect(302, `/?bloqueado=${encodeURIComponent(m.chave)}`);
        }
    }
    return next();
}
