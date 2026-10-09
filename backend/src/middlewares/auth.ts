import prisma from '../db';
import { obterSetting } from '../utils/settings';
import { comEmpresa, comoSistema } from '../tenant';
import { lerContrato, motivoBloqueio } from '../utils/contrato';
import { moduloBloqueadoDaApi } from '../utils/modulos';

// Autentica o operador a partir do token (Authorization: Bearer <token>)
export async function autenticar(req: any, res: any, next: any) {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ')
            ? header.slice(7)
            : (req.cookies?.jg_sessao ?? null);

        if (!token) {
            return res.status(401).json({ erro: "Operador não autenticado! Faça login." });
        }

        // A sessão é procurada sem filtro de empresa: é ela que diz qual é a empresa.
        const user = await comoSistema(() => prisma.user.findFirst({
            where: { sessionToken: token, isActive: true }
        }));

        if (!user) {
            return res.status(401).json({ erro: "Sessão expirada ou inválida. Faça login novamente." });
        }

        // Sessão com validade (sliding): expira após Xh de inatividade.
        if (user.sessionExpiresAt && user.sessionExpiresAt < new Date()) {
            await comoSistema(() => prisma.user.update({
                where: { id: user.id },
                data: { sessionToken: null, sessionExpiresAt: null, updatedAt: new Date() }
            }));
            return res.status(401).json({ erro: "Sessão expirada. Faça login novamente." });
        }

        // Contrato da empresa: suspensão/mensalidade e módulos liberados.
        const contrato = await lerContrato(user.companyId);
        const bloqueio = motivoBloqueio(contrato);
        if (bloqueio) {
            return res.status(403).json({ erro: bloqueio, bloqueado: true });
        }

        // Daqui em diante tudo roda dentro da empresa do operador.
        return comEmpresa(user.companyId, () => continuarAutenticado(req, res, next, user), contrato);
    } catch (e) {
        return res.status(500).json({ erro: "Erro ao autenticar o operador." });
    }
}

async function continuarAutenticado(req: any, res: any, next: any, user: any) {
    try {
        const caminho = String(req.originalUrl || '').split('?')[0];
        const modulo = moduloBloqueadoDaApi(caminho);
        if (modulo) {
            return res.status(403).json({ erro: `O módulo "${modulo.nome}" não está liberado no seu plano.`, modulo: modulo.chave });
        }

        // Renovação deslizante: só escreve no banco quando resta menos da metade do tempo.
        const horas = Number(await obterSetting<number>('seg_sessao_horas', 12)) || 12;
        const expira = user.sessionExpiresAt ? new Date(user.sessionExpiresAt).getTime() : Date.now();
        const meiaVida = horas * 30 * 60 * 1000; // metade do tempo em ms
        if (expira - Date.now() < meiaVida) {
            const novoExpira = new Date(Date.now() + horas * 60 * 60 * 1000);
            await prisma.user.update({
                where: { id: user.id },
                data: { sessionExpiresAt: novoExpira, updatedAt: new Date() }
            }).catch(() => {});
        }

        req.operador = user;
        next();
    } catch (e) {
        return res.status(500).json({ erro: "Erro ao autenticar o operador." });
    }
}

// Restringe o acesso a determinados perfis
export const requerPermissao = (...papeis: string[]) => (req: any, res: any, next: any) => {
    if (!req.operador) {
        return res.status(401).json({ erro: "Operador não autenticado!" });
    }
    if (!papeis.includes(req.operador.role)) {
        return res.status(403).json({ erro: "Acesso não permitido para este operador!" });
    }
    next();
};

// Verdadeiro quando o operador é de caixa (SELLER)
export const ehOperadorDeCaixa = (req: any) => req.operador?.role === 'SELLER';
