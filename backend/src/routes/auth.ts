import { Router } from 'express';
import { randomUUID, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../db';
import { autenticar, requerPermissao } from '../middlewares/auth';
import { obterSetting } from '../utils/settings';
import { validarPoliticaSenha } from '../utils/senhas';
import { comEmpresa, comoSistema } from '../tenant';
import { lerContrato, motivoBloqueio, situacaoMensalidade } from '../utils/contrato';

// Cookie que lembra a empresa deste navegador (para a lista de operadores e o login
// pelo nome). Não é credencial: só delimita a busca; a senha continua obrigatória.
const COOKIE_EMPRESA = 'jg_empresa';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const empresaDoNavegador = (req: any): string | null => {
    const v = String(req.cookies?.[COOKIE_EMPRESA] ?? '');
    return UUID.test(v) ? v : null;
};

const router = Router();

const gerarToken = () => randomBytes(32).toString('hex');

const serializar = (u: any) => ({
    id: u.id,
    nome: u.name,
    email: u.email,
    papel: u.role,
    caixaNumber: u.caixaNumber ?? null,
    commissionRate: Number(u.commissionRate ?? 0),
    filialId: u.branchId ?? null,
    token: u.sessionToken,
    expiraEm: u.sessionExpiresAt ?? null,
    trocarSenha: Boolean(u.mustChangePassword)
});

// Registra uma tentativa de login (auditoria de acesso).
const registrarAudit = async (dados: {
    ip?: string | null;
    userId?: string | null;
    identificador: string;
    success: boolean;
    detail?: string;
    suspeito?: boolean;
    companyId?: string | null;
}) => {
    try {
        await comoSistema(() => prisma.loginAudit.create({
            data: {
                id: randomUUID(),
                companyId: dados.companyId ?? null,
                userId: dados.userId ?? null,
                identificador: String(dados.identificador).slice(0, 200),
                ip: dados.ip ?? null,
                success: dados.success,
                suspeito: dados.suspeito ?? false,
                detail: dados.detail ? String(dados.detail).slice(0, 500) : null,
                createdAt: new Date()
            }
        }));
    } catch (e) { /* auditoria não pode derrubar o login */ }
};

// GET /api/auth/operadores - Lista operadores ativos (para a tela de login)
router.get('/operadores', async (req: any, res: any) => {
    const empresaId = empresaDoNavegador(req);
    if (!empresaId) return res.json([]); // primeiro acesso neste navegador: entrar pelo e-mail
    const operadores = await comEmpresa(empresaId, () => prisma.user.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' }
    }));
    return res.json(operadores.map((u) => ({
        id: u.id,
        nome: u.name,
        email: u.email,
        papel: u.role,
        caixaNumber: u.caixaNumber ?? null,
        commissionRate: Number(u.commissionRate ?? 0)
    })));
});

// POST /api/auth/login - Autentica o operador e inicia a sessão (fluxo Ecocentauro)
router.post('/login', async (req: any, res: any) => {
    const { identificador, senha } = req.body;
    const ip = req.ip || req.socket?.remoteAddress || null;

    if (!identificador || !senha) {
        return res.status(400).json({ erro: "Informe o operador e a senha!" });
    }

    const busca = String(identificador).trim();
    const empresaNavegador = empresaDoNavegador(req);
    // E-mail é único no sistema todo. O nome só vale dentro da empresa deste navegador.
    const candidatos = await comoSistema(() => prisma.user.findMany({
        where: {
            isActive: true,
            OR: [
                { email: { equals: busca, mode: 'insensitive' } },
                { name: { equals: busca, mode: 'insensitive' }, ...(empresaNavegador ? { companyId: empresaNavegador } : {}) }
            ]
        },
        take: 3
    }));
    const porEmail = candidatos.find(u => u.email.toLowerCase() === busca.toLowerCase());
    const user = porEmail ?? (candidatos.length === 1 ? candidatos[0] : null);

    if (!user) {
        const ambiguo = !porEmail && candidatos.length > 1;
        await registrarAudit({ ip, identificador: busca, success: false, companyId: empresaNavegador, detail: ambiguo ? 'Nome de operador em mais de uma empresa' : 'Operador não encontrado ou inativo' });
        return res.status(401).json({ erro: ambiguo ? "Entre com o seu e-mail (há mais de um operador com esse nome)." : "Operador não encontrado ou inativo!" });
    }

    // O restante do login acontece dentro da empresa do operador.
    return comEmpresa(user.companyId, () => concluirLogin(req, res, user, busca, ip));
});

async function concluirLogin(req: any, res: any, user: any, busca: string, ip: string | null) {
    const companyId = user.companyId;

    // Bloqueio por excesso de tentativas (anti força bruta)
    if (user.lockedUntil && user.lockedUntil > new Date()) {
        const min = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
        await registrarAudit({ ip, companyId, userId: user.id, identificador: busca, success: false, detail: 'Tentativa em conta bloqueada' });
        return res.status(429).json({ erro: `Conta bloqueada por excesso de tentativas. Tente novamente em ${min} minuto(s).` });
    }

    const senhaOk = await bcrypt.compare(String(req.body?.senha ?? ""), user.password);
    if (!senhaOk) {
        const maxTentativas = Number(await obterSetting<number>('seg_login_max_tentativas', 5)) || 5;
        const travamentoMin = Number(await obterSetting<number>('seg_login_travamento_min', 15)) || 15;
        const falhas = (user.failedLoginCount ?? 0) + 1;
        const travado = falhas >= maxTentativas;

        await prisma.user.update({
            where: { id: user.id },
            data: {
                failedLoginCount: travado ? 0 : falhas,
                lockedUntil: travado ? new Date(Date.now() + travamentoMin * 60000) : null,
                updatedAt: new Date()
            }
        });
        await registrarAudit({
            ip,
            companyId,
            userId: user.id,
            identificador: busca,
            success: false,
            detail: travado
                ? `Senha incorreta — conta bloqueada por ${travamentoMin} min após ${falhas} tentativas`
                : `Senha incorreta (tentativa ${falhas} de ${maxTentativas})`
        });
        return res.status(401).json({ erro: "Senha incorreta!" });
    }

    // Contrato da empresa (painel SaaS): suspensão e mensalidade vencida bloqueiam o acesso.
    const contrato = await lerContrato(companyId);
    const bloqueio = motivoBloqueio(contrato);
    if (bloqueio) {
        await registrarAudit({ ip, companyId, userId: user.id, identificador: busca, success: false, detail: 'Acesso bloqueado pelo contrato (suspensão ou mensalidade)' });
        return res.status(403).json({ erro: bloqueio });
    }

    // Instalação local antiga: o painel injetava MENSALIDADE_VENCIMENTO no env da instância.
    const venc = process.env.MENSALIDADE_VENCIMENTO;
    if (venc && /^\d{4}-\d{2}-\d{2}/.test(venc)) {
        const janelaHoras = Number(process.env.MENSALIDADE_JANELA_HORAS) || 72;
        const fim = new Date(`${venc.slice(0, 10)}T00:00:00`);
        fim.setHours(fim.getHours() + janelaHoras);
        if (Date.now() > fim.getTime()) {
            await registrarAudit({
                ip,
                companyId,
                userId: user.id,
                identificador: busca,
                success: false,
                detail: 'Mensalidade vencida há mais da janela — acesso bloqueado'
            });
            return res.status(403).json({ erro: "Mensalidade vencida. Seu acesso foi bloqueado. Procure o suporte para regularizar." });
        }
    }

    // Sucesso: zera contadores e detecta acesso suspeito (IP nunca usado por este usuário)
    const horizonte = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const jaVisto = await prisma.loginAudit.count({
        where: { userId: user.id, success: true, ip: ip ?? undefined, createdAt: { gte: horizonte } }
    });
    const suspeito = jaVisto === 0;

    const horasSessao = Number(await obterSetting<number>('seg_sessao_horas', 12)) || 12;
    const token = gerarToken();
    const expiraEm = new Date(Date.now() + horasSessao * 60 * 60 * 1000);

    const atualizado = await prisma.user.update({
        where: { id: user.id },
        data: {
            sessionToken: token,
            sessionExpiresAt: expiraEm,
            failedLoginCount: 0,
            lockedUntil: null,
            updatedAt: new Date()
        }
    });

    // Sessão em cookie httpOnly: o token nunca fica acessível ao JavaScript do
    // navegador (imune a roubo via XSS). O servidor continua validando a sessão
    // no banco a cada requisição (middleware de autenticação).
    const viaHttps = req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https');
    res.cookie('jg_sessao', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: viaHttps,
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000
    });

    await registrarAudit({
        ip,
        companyId,
        userId: user.id,
        identificador: busca,
        success: true,
        suspeito,
        detail: suspeito ? 'Login de um novo IP não visto para este operador nos últimos 30 dias' : 'Login com IP já conhecido'
    });

    // Aviso de mensalidade: venceu hoje (ou está na janela de tolerância) → avisa,
    // mas libera o acesso. O bloqueio duro fica com o painel (auto-suspensão).
    let avisoMensalidade: any = situacaoMensalidade(contrato).aviso;
    const vencAv = process.env.MENSALIDADE_VENCIMENTO;
    if (!avisoMensalidade && vencAv && /^\d{4}-\d{2}-\d{2}/.test(vencAv)) {
        const janelaHoras = Number(process.env.MENSALIDADE_JANELA_HORAS) || 72;
        const inicio = new Date(`${vencAv.slice(0, 10)}T00:00:00`);
        const fim = new Date(inicio.getTime());
        fim.setHours(fim.getHours() + janelaHoras);
        if (Date.now() >= inicio.getTime() && Date.now() <= fim.getTime()) {
            const diasRestantes = Math.max(1, Math.ceil((fim.getTime() - Date.now()) / 86400000));
            avisoMensalidade = {
                mensagem: `Sua mensalidade venceu em ${inicio.toLocaleDateString('pt-BR')}. Você tem ${diasRestantes} dia(s) para regularizar. Após esse prazo, seu acesso será bloqueado.`,
                venceuEm: inicio.toISOString(),
                bloqueiaEm: fim.toISOString()
            };
        }
    }

    // Lembra a empresa deste navegador (lista de operadores e login pelo nome).
    res.cookie(COOKIE_EMPRESA, companyId, { httpOnly: true, sameSite: 'lax', secure: viaHttps, path: '/', maxAge: 365 * 24 * 60 * 60 * 1000 });

    // O token é entregue somente no cookie httpOnly — não vai no corpo da resposta.
    const { token: _semToken, ...operador } = serializar(atualizado);
    return res.json({ ...operador, avisoMensalidade });
}

// POST /api/auth/logout - Encerra a sessão do operador
router.post('/logout', autenticar, async (req: any, res: any) => {
    await prisma.user.update({
        where: { id: req.operador.id },
        data: { sessionToken: null, sessionExpiresAt: null, updatedAt: new Date() }
    });
    res.clearCookie('jg_sessao', { path: '/' });
    return res.json({ ok: true });
});

// POST /api/auth/verificar-senha-admin - Autoriza operações sensíveis com a senha do administrador
router.post('/verificar-senha-admin', autenticar, async (req: any, res: any) => {
    const { senha } = req.body;
    if (!senha) {
        return res.status(400).json({ erro: "Informe a senha do administrador!" });
    }

    const admin = await prisma.user.findFirst({
        where: { isActive: true, role: 'ADMIN' },
        orderBy: { createdAt: 'asc' }
    });

    if (!admin) {
        return res.status(500).json({ erro: "Nenhum administrador cadastrado!" });
    }

    const senhaOk = await bcrypt.compare(String(senha), admin.password);
    if (!senhaOk) {
        return res.status(401).json({ erro: "Senha de administrador incorreta!" });
    }

    return res.json({ ok: true });
});

// POST /api/auth/trocar-senha (e PUT /api/auth/minha-senha) - Troca a própria senha
// Body: { senhaAtual, novaSenha }
const trocarSenhaHandler = async (req: any, res: any) => {
    const { senhaAtual, novaSenha } = req.body;
    if (!senhaAtual || !novaSenha) {
        return res.status(400).json({ erro: "Informe a senha atual e a nova senha!" });
    }

    const ok = await bcrypt.compare(String(senhaAtual), req.operador.password);
    if (!ok) {
        return res.status(401).json({ erro: "Senha atual incorreta!" });
    }

    const erroPolitica = await validarPoliticaSenha(novaSenha);
    if (erroPolitica) {
        return res.status(400).json({ erro: erroPolitica });
    }
    if (String(novaSenha) === String(senhaAtual)) {
        return res.status(400).json({ erro: "A nova senha deve ser diferente da atual!" });
    }

    const hash = await bcrypt.hash(String(novaSenha), 10);
    await prisma.user.update({
        where: { id: req.operador.id },
        data: {
            password: hash,
            mustChangePassword: false,
            passwordChangedAt: new Date(),
            updatedAt: new Date()
        }
    });
    return res.json({ ok: true });
};
router.post('/trocar-senha', autenticar, trocarSenhaHandler);
router.put('/minha-senha', autenticar, trocarSenhaHandler);

// POST /api/auth/revogar-sessoes/:id - Derruba todas as sessões de um operador
router.post('/revogar-sessoes/:id', autenticar, requerPermissao('ADMIN', 'MANAGER'), async (req: any, res: any) => {
    const { id } = req.params;
    const alvo = await prisma.user.findUnique({ where: { id } });
    if (!alvo) {
        return res.status(404).json({ erro: "Operador não encontrado!" });
    }
    await prisma.user.update({
        where: { id },
        data: { sessionToken: null, sessionExpiresAt: null, updatedAt: new Date() }
    });
    return res.json({ ok: true, revogado: true });
});

// GET /api/auth/logins - Auditoria de tentativas de login (admin/gerência)
router.get('/logins', autenticar, requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { de, ate, usuario, resultado } = req.query;
    const and: any[] = [];
    if (de || ate) {
        const range: any = {};
        if (de) range.gte = new Date(`${de}T00:00:00`);
        if (ate) range.lte = new Date(`${ate}T23:59:59`);
        and.push({ createdAt: range });
    }
    if (usuario) {
        and.push({
            OR: [
                { identificador: { contains: String(usuario), mode: 'insensitive' } },
                { User: { name: { contains: String(usuario), mode: 'insensitive' } } }
            ]
        });
    }
    if (resultado === 'sucesso') and.push({ success: true });
    if (resultado === 'falha') and.push({ success: false });
    if (resultado === 'suspeito') and.push({ suspeito: true });

    const logs = await prisma.loginAudit.findMany({
        where: and.length ? { AND: and } : {},
        orderBy: { createdAt: 'desc' },
        take: 500,
        include: { User: { select: { name: true } } }
    });

    const falhas24h = await prisma.loginAudit.count({
        where: { success: false, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
    });

    return res.json({
        falhas24h,
        logs: logs.map(l => ({
            id: l.id,
            operador: l.User?.name ?? null,
            identificador: l.identificador,
            ip: l.ip,
            success: l.success,
            suspeito: l.suspeito,
            detail: l.detail,
            data: l.createdAt
        }))
    });
});

// POST /api/auth/operadores - Cria um novo operador (administrador/gerência)
router.post('/operadores', autenticar, requerPermissao('ADMIN', 'MANAGER'), async (req: any, res: any) => {
    const { nome, email, senha, papel, comissao } = req.body;

    if (!nome || nome.trim() === '' || !email || email.trim() === '' || !senha) {
        return res.status(400).json({ erro: "Informe nome, e-mail e senha do operador!" });
    }

    const erroPolitica = await validarPoliticaSenha(senha);
    if (erroPolitica) {
        return res.status(400).json({ erro: erroPolitica });
    }

    const empresa = await prisma.company.findUnique({ where: { id: req.operador.companyId } });
    if (!empresa) {
        return res.status(400).json({ erro: "Empresa não configurada!" });
    }

    const emailNormalizado = String(email).trim().toLowerCase();
    // O e-mail é o login e vale para o sistema todo (todas as empresas).
    const existente = await comoSistema(() => prisma.user.findUnique({ where: { email: emailNormalizado } }));
    if (existente) {
        return res.status(400).json({ erro: "E-mail já cadastrado para outro operador!" });
    }

    // Limite de usuários do plano contratado (0 = ilimitado)
    const contrato = await lerContrato(empresa.id);
    if (contrato.limites.usuarios > 0) {
        const ativos = await prisma.user.count({ where: { isActive: true } });
        if (ativos >= contrato.limites.usuarios) {
            return res.status(403).json({ erro: `Seu plano permite ${contrato.limites.usuarios} usuário(s) ativo(s). Desative um operador ou fale com a JG Sistemas para ampliar o plano.` });
        }
    }

    const role = papel || 'SELLER';

    // Operador de caixa recebe automaticamente o próximo número livre de registradora
    let caixaNumber: number | null = null;
    if (role === 'SELLER') {
        const usados = await prisma.user.findMany({
            where: { caixaNumber: { not: null } },
            select: { caixaNumber: true }
        });
        const ocupados = new Set(usados.map(u => u.caixaNumber));
        for (let n = 1; n <= 10; n++) {
            if (!ocupados.has(n)) { caixaNumber = n; break; }
        }
    }

    const hash = await bcrypt.hash(String(senha), 10);
    const user = await prisma.user.create({
        data: {
            id: randomUUID(),
            companyId: empresa.id,
            name: nome.trim().toUpperCase(),
            email: emailNormalizado,
            password: hash,
            role: role as any,
            caixaNumber,
            commissionRate: comissao !== undefined ? (Number(comissao) || 0) : 0,
            isActive: true,
            mustChangePassword: true,
            passwordChangedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        }
    });

    return res.status(201).json(serializar({ ...user, sessionToken: null, sessionExpiresAt: null }));
});

// PUT /api/auth/operadores/:id - Atualiza operador (nome, e-mail, papel, comissão, ativo)
router.put('/operadores/:id', autenticar, requerPermissao('ADMIN', 'MANAGER'), async (req: any, res: any) => {
    const { id } = req.params;
    const { nome, email, papel, comissao, ativo, senha } = req.body;

    const existente = await prisma.user.findUnique({ where: { id } });
    if (!existente) {
        return res.status(404).json({ erro: "Operador não encontrado!" });
    }

    if (email) {
        const normalizado = String(email).trim().toLowerCase();
        const dup = await comoSistema(() => prisma.user.findFirst({
            where: { email: normalizado, id: { not: id } }
        }));
        if (dup) {
            return res.status(400).json({ erro: "E-mail já cadastrado para outro operador!" });
        }
    }

    const dados: any = {
        name: nome !== undefined ? String(nome).trim().toUpperCase() : existente.name,
        email: email !== undefined ? String(email).trim().toLowerCase() : existente.email,
        role: papel !== undefined ? papel : existente.role,
        commissionRate: comissao !== undefined ? (Number(comissao) || 0) : existente.commissionRate,
        isActive: ativo !== undefined ? Boolean(ativo) : existente.isActive,
        updatedAt: new Date()
    };
    if (senha) {
        const erroPolitica = await validarPoliticaSenha(senha);
        if (erroPolitica) {
            return res.status(400).json({ erro: erroPolitica });
        }
        dados.password = await bcrypt.hash(String(senha), 10);
        dados.mustChangePassword = true;
        dados.passwordChangedAt = new Date();
        dados.sessionToken = null;
        dados.sessionExpiresAt = null;
    }

    // Reativar operador também respeita o limite de usuários do plano
    if (dados.isActive && !existente.isActive) {
        const contrato = await lerContrato(existente.companyId);
        if (contrato.limites.usuarios > 0) {
            const ativos = await prisma.user.count({ where: { isActive: true } });
            if (ativos >= contrato.limites.usuarios) {
                return res.status(403).json({ erro: `Seu plano permite ${contrato.limites.usuarios} usuário(s) ativo(s).` });
            }
        }
    }

    const user = await prisma.user.update({ where: { id }, data: dados });
    return res.json(serializar({ ...user, sessionToken: null, sessionExpiresAt: null }));
});

export default router;
