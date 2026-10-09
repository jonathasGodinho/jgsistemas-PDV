// Painel do Administrador da JG Sistemas (SaaS): empresas contratantes, módulos,
// planos, mensalidades e saúde dos clientes. Tudo aqui roda como "sistema"
// (enxerga todas as empresas), protegido por login próprio do painel.
import { Router } from 'express';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../db';
import { comoSistema } from '../tenant';
import { CATALOGO } from '../utils/modulos';
import { CHAVE_CONTRATO, Contrato, esquecerContrato, lerContrato, motivoBloqueio, normalizarContrato } from '../utils/contrato';
import { criarLimiter } from '../middlewares/rateLimit';

const router = Router();

// ---------------------------------------------------------------- utilidades
const SEGMENTOS = ['MODA', 'VAREJO', 'SALAO'];
const FORMAS = ['PIX', 'BOLETO', 'CARTAO', 'DINHEIRO', 'TRANSFERENCIA', 'OUTRO'];
const soDigitos = (v: any) => String(v ?? '').replace(/\D/g, '');
const num = (v: any) => Number(v ?? 0) || 0;
const dia = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const hojeISO = () => new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10); // Manaus (UTC-4)
const competenciaAtual = () => hojeISO().slice(0, 7);
const CARACTERES = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const gerarSenha = (n = 14) => [...randomBytes(n)].map(b => CARACTERES[b % CARACTERES.length]).join('');
const dataDoVencimento = (competencia: string, diaVenc: number) => `${competencia}-${String(Math.min(28, Math.max(1, diaVenc))).padStart(2, '0')}`;
const diasEntre = (aISO: string, bISO: string) => Math.round((Date.parse(bISO + 'T00:00:00Z') - Date.parse(aISO + 'T00:00:00Z')) / 86400000);

const sistema = <T>(fn: () => Promise<T>) => comoSistema(fn);
const lerPlataforma = async <T>(chave: string, padrao: T): Promise<T> => {
    const l = await sistema(() => prisma.platformSetting.findUnique({ where: { key: chave } }));
    return (l?.value as any) ?? padrao;
};
const gravarPlataforma = (chave: string, valor: any) => sistema(() => prisma.platformSetting.upsert({
    where: { key: chave }, create: { key: chave, value: valor }, update: { value: valor }
}));

async function nota(companyId: string, tipo: string, texto: string) {
    await sistema(() => prisma.saasNota.create({ data: { id: randomUUID(), companyId, tipo, texto: texto.slice(0, 2000), autor: 'Painel' } })).catch(() => { });
}

// ---------------------------------------------------------------- planos
type Plano = { id: string; nome: string; valor: number; usuarios: number; caixas: number; descricao: string; destaque?: boolean; modulos: string[] };
const PLANOS_PADRAO: Plano[] = [
    { id: 'basico', nome: 'Básico', valor: 99.9, usuarios: 2, caixas: 1, descricao: 'PDV, caixa, clientes, produtos e NFC-e.', modulos: ['orcamentos', 'nfce', 'estoque', 'relatorios'] },
    { id: 'profissional', nome: 'Profissional', valor: 199.9, usuarios: 5, caixas: 2, destaque: true, descricao: 'Tudo do Básico + crediário, fidelidade, promoções e financeiro.', modulos: ['orcamentos', 'nfce', 'estoque', 'relatorios', 'trocas', 'crediario', 'cobranca', 'fidelidade', 'precos', 'financeiro', 'colaboradores'] },
    { id: 'completo', nome: 'Completo', valor: 349.9, usuarios: 0, caixas: 0, descricao: 'Todos os módulos disponíveis, usuários e caixas ilimitados.', modulos: ['orcamentos', 'nfce', 'estoque', 'relatorios', 'trocas', 'crediario', 'cobranca', 'fidelidade', 'precos', 'financeiro', 'colaboradores', 'inventario', 'cartoes'] }
];
const ADICIONAL_PADRAO = 29.9;
const chavesValidas = () => new Set(CATALOGO.map(m => m.chave));
const lerPlanos = () => lerPlataforma<{ planos: Plano[]; adicionais: Record<string, number> }>('planos', { planos: PLANOS_PADRAO, adicionais: {} });
const precoAdicional = (chave: string, adicionais: Record<string, number>) => adicionais[chave] ?? ADICIONAL_PADRAO;
const modulosPadrao = () => CATALOGO.filter(m => !m.futuro).map(m => m.chave);

function resumoCobranca(c: Contrato, dados: { planos: Plano[]; adicionais: Record<string, number> }) {
    const plano = dados.planos.find(p => p.id === c.planoId) || null;
    const incluidos = new Set(plano ? plano.modulos : []);
    const extras = (c.modulos ?? modulosPadrao()).filter(m => !incluidos.has(m));
    const valorExtras = extras.reduce((s, m) => s + precoAdicional(m, dados.adicionais), 0);
    return { plano, extras, valorPlano: plano ? plano.valor : 0, valorExtras: +valorExtras.toFixed(2), total: +((plano ? plano.valor : 0) + valorExtras).toFixed(2) };
}

// ---------------------------------------------------------------- contrato
async function gravarContrato(companyId: string, c: Contrato) {
    const valor = { ...c, atualizadoEm: new Date().toISOString() };
    await sistema(async () => {
        const atual = await prisma.setting.findFirst({ where: { companyId, key: CHAVE_CONTRATO } });
        if (atual) await prisma.setting.update({ where: { id: atual.id }, data: { value: valor as any, updatedAt: new Date() } });
        else await prisma.setting.create({ data: { id: randomUUID(), companyId, key: CHAVE_CONTRATO, value: valor as any, createdAt: new Date(), updatedAt: new Date() } });
        // segmento também é usado pelo ERP (menu e telas por segmento)
        const seg = await prisma.setting.findFirst({ where: { companyId, key: 'segmento' } });
        if (seg) await prisma.setting.update({ where: { id: seg.id }, data: { value: c.segmento, updatedAt: new Date() } });
        else await prisma.setting.create({ data: { id: randomUUID(), companyId, key: 'segmento', value: c.segmento, createdAt: new Date(), updatedAt: new Date() } });
    });
    esquecerContrato(companyId);
}

// O vencimento que bloqueia o acesso é o da mensalidade em aberto mais antiga.
async function sincronizarVencimento(companyId: string) {
    const aberta = await sistema(() => prisma.saasCobranca.findFirst({ where: { companyId, status: 'PENDENTE' }, orderBy: { vencimento: 'asc' } }));
    const c = await lerContrato(companyId);
    const venc = aberta ? dia(aberta.vencimento) : null;
    if (c.vencimento !== venc) await gravarContrato(companyId, { ...c, vencimento: venc });
}

// ---------------------------------------------------------------- saúde do cliente
type Saude = { situacao: 'EM_DIA' | 'ATRASADO' | 'INADIMPLENTE' | 'SEM_COBRANCA'; emAberto: number; vencido: number; qtdVencidas: number; diasAtraso: number; proximoVencimento: string | null; ultimoPagamento: string | null };
function saudeFinanceira(cobs: { status: string; vencimento: Date; valor: any; pagoEm: Date | null }[]): Saude {
    const hoje = hojeISO();
    const abertas = cobs.filter(c => c.status === 'PENDENTE');
    const vencidas = abertas.filter(c => dia(c.vencimento)! < hoje);
    const diasAtraso = vencidas.reduce((m, c) => Math.max(m, diasEntre(dia(c.vencimento)!, hoje)), 0);
    const pagas = cobs.filter(c => c.status === 'PAGO' && c.pagoEm).sort((a, b) => +new Date(b.pagoEm!) - +new Date(a.pagoEm!));
    const futuras = abertas.filter(c => dia(c.vencimento)! >= hoje).sort((a, b) => +a.vencimento - +b.vencimento);
    let situacao: Saude['situacao'] = 'EM_DIA';
    if (!cobs.some(c => c.status !== 'CANCELADO')) situacao = 'SEM_COBRANCA';
    else if (vencidas.length >= 2 || diasAtraso > 30) situacao = 'INADIMPLENTE';
    else if (vencidas.length === 1) situacao = 'ATRASADO';
    return {
        situacao,
        emAberto: +abertas.reduce((s, c) => s + num(c.valor), 0).toFixed(2),
        vencido: +vencidas.reduce((s, c) => s + num(c.valor), 0).toFixed(2),
        qtdVencidas: vencidas.length,
        diasAtraso,
        proximoVencimento: futuras.length ? dia(futuras[0].vencimento) : null,
        ultimoPagamento: pagas.length ? dia(pagas[0].pagoEm) : null
    };
}

// ---------------------------------------------------------------- sessão do painel
// Sessão sem estado (funciona em várias instâncias serverless): cookie assinado com
// HMAC. A chave inclui o hash da senha, então trocar a senha derruba as sessões.
const COOKIE = 'jg_painel';
const DURACAO_MS = 12 * 3600000;

async function hashSenhaPainel(): Promise<string | null> {
    const salvo = await lerPlataforma<string | null>('painel_senha_hash', null);
    return salvo || process.env.PAINEL_SENHA_HASH || null;
}
const chaveSessao = (hash: string) => createHmac('sha256', String(process.env.JG_CHAVE_CRIPTO || 'jg-painel')).update('painel:' + hash).digest();
const assinar = (dados: string, hash: string) => createHmac('sha256', chaveSessao(hash)).update(dados).digest('base64url');

async function emitirSessao(res: any, req: any) {
    const hash = (await hashSenhaPainel())!;
    const exp = Date.now() + DURACAO_MS;
    const dados = `${exp}.${randomBytes(9).toString('base64url')}`;
    const viaHttps = req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https');
    res.cookie(COOKIE, `${dados}.${assinar(dados, hash)}`, { httpOnly: true, sameSite: 'strict', secure: viaHttps, path: '/api/painel', maxAge: DURACAO_MS });
}

async function sessaoValida(req: any): Promise<boolean> {
    const v = String(req.cookies?.[COOKIE] ?? '');
    const partes = v.split('.');
    if (partes.length !== 3) return false;
    const [exp, nonce, sig] = partes;
    if (!(Number(exp) > Date.now())) return false;
    const hash = await hashSenhaPainel();
    if (!hash) return false;
    const esperado = Buffer.from(assinar(`${exp}.${nonce}`, hash));
    const recebido = Buffer.from(sig);
    return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

async function exigirPainel(req: any, res: any, next: any) {
    try {
        if (!(await sessaoValida(req))) return res.status(401).json({ erro: 'Sessão do painel expirada. Entre novamente.' });
        return comoSistema(() => next());
    } catch (e: any) {
        return res.status(500).json({ erro: 'Falha ao validar a sessão do painel.' });
    }
}

// Erros assíncronos viram resposta JSON (Express 5 também repassa, mas mantém a mensagem).
const h = (fn: (req: any, res: any) => Promise<any>) => async (req: any, res: any) => {
    try { await fn(req, res); } catch (e: any) {
        const msg = e?.code === 'P2002' ? 'Registro duplicado (CNPJ, e-mail ou competência já cadastrados).' : (e?.message || 'Erro no painel');
        if (!res.headersSent) res.status(e?.status || 500).json({ erro: msg });
    }
};
const falha = (status: number, mensagem: string) => Object.assign(new Error(mensagem), { status });

router.use('/login', criarLimiter({ chave: 'painel-login', janelaMs: 60_000, max: 8, mensagem: 'Muitas tentativas de login no painel. Aguarde um minuto.' }));

router.post('/login', h(async (req, res) => {
    const senha = String(req.body?.senha ?? '');
    const hash = await hashSenhaPainel();
    if (!hash) return res.status(503).json({ erro: 'Senha do painel ainda não configurada.' });
    if (!senha || !(await bcrypt.compare(senha, hash))) {
        await new Promise(r => setTimeout(r, 400));
        return res.status(401).json({ erro: 'Senha incorreta.' });
    }
    await emitirSessao(res, req);
    return res.json({ ok: true });
}));

router.post('/logout', (_req: any, res: any) => {
    res.clearCookie(COOKIE, { path: '/api/painel' });
    return res.json({ ok: true });
});

router.use(exigirPainel);

router.get('/sessao', (_req: any, res: any) => res.json({ ok: true }));

router.put('/senha', h(async (req, res) => {
    const { atual, nova } = req.body || {};
    const hash = await hashSenhaPainel();
    if (!hash || !(await bcrypt.compare(String(atual ?? ''), hash))) throw falha(401, 'Senha atual incorreta.');
    if (String(nova ?? '').length < 10) throw falha(400, 'A nova senha precisa ter pelo menos 10 caracteres.');
    await gravarPlataforma('painel_senha_hash', await bcrypt.hash(String(nova), 10));
    await emitirSessao(res, req);
    return res.json({ ok: true });
}));

// ---------------------------------------------------------------- catálogo e planos
router.get('/catalogo', h(async (_req, res) => {
    const dados = await lerPlanos();
    return res.json({
        modulos: CATALOGO.map(m => ({ ...m, precoAdicional: precoAdicional(m.chave, dados.adicionais) })),
        planos: dados.planos,
        adicionais: dados.adicionais
    });
}));

router.put('/planos', h(async (req, res) => {
    const { planos, adicionais } = req.body || {};
    if (!Array.isArray(planos) || !planos.length) throw falha(400, 'Informe ao menos um plano!');
    const validas = chavesValidas();
    const lista: Plano[] = planos.map((p: any) => ({
        id: String(p.id || '').trim() || 'plano-' + Date.now().toString(36),
        nome: String(p.nome || '').trim() || 'Plano',
        valor: Math.max(0, num(p.valor)),
        usuarios: Math.max(0, Math.round(num(p.usuarios))),
        caixas: Math.max(0, Math.round(num(p.caixas))),
        descricao: String(p.descricao || '').slice(0, 200),
        destaque: !!p.destaque,
        modulos: [...new Set<string>((p.modulos || []).filter((m: string) => validas.has(m)))]
    }));
    if (new Set(lista.map(p => p.id)).size !== lista.length) throw falha(400, 'Há planos com o mesmo identificador!');
    const ad: Record<string, number> = {};
    for (const [k, v] of Object.entries(adicionais || {})) if (validas.has(k)) ad[k] = Math.max(0, num(v));
    await gravarPlataforma('planos', { planos: lista, adicionais: ad });

    // Clientes que seguem o plano (sem ajuste manual) recebem a nova matriz na hora.
    let alterados = 0;
    const empresas = await sistema(() => prisma.company.findMany({ select: { id: true } }));
    for (const e of empresas) {
        const c = await lerContrato(e.id);
        const p = lista.find(x => x.id === c.planoId);
        if (!p || c.personalizado) continue;
        await gravarContrato(e.id, { ...c, plano: p.nome, modulos: [...p.modulos], limites: { usuarios: p.usuarios, caixas: p.caixas } });
        alterados++;
    }
    return res.json({ planos: lista, adicionais: ad, clientesAtualizados: alterados });
}));

// ---------------------------------------------------------------- clientes
async function montarClientes(ids?: string[]) {
    const onde = ids ? { id: { in: ids } } : {};
    const desde30 = new Date(Date.now() - 30 * 86400000);
    const [empresas, admins, usuarios, acessos, vendas, cobrancas, contratos] = await sistema(() => Promise.all([
        prisma.company.findMany({ where: onde, orderBy: { createdAt: 'desc' } }),
        prisma.user.findMany({ where: { role: 'ADMIN', ...(ids ? { companyId: { in: ids } } : {}) }, orderBy: { createdAt: 'asc' }, select: { companyId: true, email: true, name: true } }),
        prisma.user.groupBy({ by: ['companyId'], where: { isActive: true, ...(ids ? { companyId: { in: ids } } : {}) }, _count: { _all: true } }),
        prisma.loginAudit.groupBy({ by: ['companyId'], where: { success: true, ...(ids ? { companyId: { in: ids } } : {}) }, _max: { createdAt: true } }),
        prisma.sale.groupBy({ by: ['companyId'], where: { status: 'COMPLETED', createdAt: { gte: desde30 }, ...(ids ? { companyId: { in: ids } } : {}) }, _count: { _all: true }, _sum: { total: true } }),
        prisma.saasCobranca.findMany({ where: ids ? { companyId: { in: ids } } : {}, select: { companyId: true, status: true, vencimento: true, valor: true, pagoEm: true } }),
        prisma.setting.findMany({ where: { key: CHAVE_CONTRATO, ...(ids ? { companyId: { in: ids } } : {}) } })
    ]));
    const planos = await lerPlanos();
    const total = CATALOGO.filter(m => !m.futuro).length;
    return empresas.map(e => {
        const contrato = normalizarContrato(contratos.find(c => c.companyId === e.id)?.value);
        const admin = admins.find(a => a.companyId === e.id);
        const v = vendas.find(x => x.companyId === e.id);
        const ultimo = acessos.find(x => x.companyId === e.id)?._max.createdAt ?? null;
        const diasSemUso = ultimo ? Math.floor((Date.now() - +new Date(ultimo)) / 86400000) : null;
        const mods = contrato.modulos ?? modulosPadrao();
        return {
            id: e.id,
            nome: e.name,
            fantasia: e.tradeName,
            cnpj: e.document,
            email: e.email, telefone: e.phone, cidade: e.city, uf: e.state,
            criadoEm: e.createdAt,
            contrato,
            status: contrato.status,
            bloqueio: motivoBloqueio(contrato),
            planoId: contrato.planoId,
            valor: contrato.valorMensal,
            cobranca: resumoCobranca(contrato, planos),
            admin: admin ? { email: admin.email, nome: admin.name } : null,
            usuariosAtivos: usuarios.find(u => u.companyId === e.id)?._count._all ?? 0,
            ultimoAcesso: ultimo,
            diasSemUso,
            uso: diasSemUso === null ? 'NUNCA' : diasSemUso <= 3 ? 'ATIVO' : diasSemUso <= 14 ? 'POUCO' : 'PARADO',
            vendas30d: { qtd: v?._count._all ?? 0, total: num(v?._sum.total) },
            modulosAtivos: mods.filter(m => CATALOGO.some(c => c.chave === m && !c.futuro)).length,
            modulosTotal: total,
            saude: saudeFinanceira(cobrancas.filter(c => c.companyId === e.id))
        };
    });
}

router.get('/clientes', h(async (_req, res) => res.json(await montarClientes())));

router.get('/clientes/:id', h(async (req, res) => {
    const [cliente] = await montarClientes([req.params.id]);
    if (!cliente) throw falha(404, 'Cliente não encontrado!');
    const id = req.params.id;
    const [cobrancas, notas, produtos, clientesFinais, empresa] = await sistema(() => Promise.all([
        prisma.saasCobranca.findMany({ where: { companyId: id }, orderBy: { vencimento: 'desc' } }),
        prisma.saasNota.findMany({ where: { companyId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
        prisma.product.count({ where: { companyId: id, isActive: true } }),
        prisma.customer.count({ where: { companyId: id } }),
        prisma.company.findUnique({ where: { id } })
    ]));
    return res.json({
        ...cliente,
        endereco: empresa ? { cep: empresa.zipCode, rua: empresa.address, numero: empresa.number, bairro: empresa.neighborhood } : null,
        totais: { produtos, clientes: clientesFinais },
        cobrancas: cobrancas.map(serializarCobranca),
        notas
    });
}));

function serializarCobranca(c: any) {
    const hoje = hojeISO();
    const venc = dia(c.vencimento)!;
    return {
        id: c.id, companyId: c.companyId, competencia: c.competencia, descricao: c.descricao,
        vencimento: venc, valor: num(c.valor), status: c.status,
        situacao: c.status === 'PENDENTE' ? (venc < hoje ? 'VENCIDA' : 'A_VENCER') : c.status,
        diasAtraso: c.status === 'PENDENTE' && venc < hoje ? diasEntre(venc, hoje) : 0,
        pagoEm: dia(c.pagoEm), valorPago: c.valorPago === null ? null : num(c.valorPago),
        formaPagamento: c.formaPagamento, observacao: c.observacao
    };
}

router.post('/clientes', h(async (req, res) => {
    const b = req.body || {};
    const nome = String(b.nome || '').trim();
    const documento = soDigitos(b.cnpj);
    const adminEmail = String(b.adminEmail || '').trim().toLowerCase();
    if (!nome) throw falha(400, 'Informe a razão social!');
    if (documento.length !== 14 && documento.length !== 11) throw falha(400, 'Informe o CNPJ (14 dígitos) ou CPF (11 dígitos).');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) throw falha(400, 'Informe um e-mail válido para o administrador do cliente.');

    const dados = await lerPlanos();
    const plano = dados.planos.find(p => p.id === b.planoId) || null;
    const segmento = SEGMENTOS.includes(b.segmento) ? b.segmento : 'MODA';
    const contrato: Contrato = normalizarContrato({
        status: 'ATIVO', planoId: plano?.id ?? null, plano: plano?.nome ?? null,
        modulos: plano ? [...plano.modulos] : modulosPadrao(), personalizado: !plano, segmento,
        limites: { usuarios: plano?.usuarios ?? 0, caixas: plano?.caixas ?? 0 },
        valorMensal: b.valor !== undefined && b.valor !== '' && b.valor !== null ? num(b.valor) : (plano?.valor ?? 0),
        diaVencimento: b.diaVencimento, toleranciaDias: b.toleranciaDias ?? 3, bloqueioAutomatico: b.bloqueioAutomatico !== false
    });

    const [docUsado, emailUsado] = await sistema(() => Promise.all([
        prisma.company.findUnique({ where: { document: documento } }),
        prisma.user.findUnique({ where: { email: adminEmail } })
    ]));
    if (docUsado) throw falha(400, 'Já existe um cliente com esse CNPJ/CPF.');
    if (emailUsado) throw falha(400, 'Esse e-mail já é usado por outro operador no sistema.');

    const senha = gerarSenha();
    const hash = await bcrypt.hash(senha, 10);
    const empresaId = randomUUID();
    const agora = new Date();
    await sistema(() => prisma.$transaction(async (tx) => {
        await tx.company.create({ data: {
            id: empresaId, name: nome, tradeName: String(b.fantasia || '').trim() || nome, document: documento, crt: 1,
            email: b.email ? String(b.email).trim() : null, phone: b.telefone ? String(b.telefone).trim() : null,
            city: b.cidade ? String(b.cidade).trim() : null, state: b.uf ? String(b.uf).trim().toUpperCase().slice(0, 2) : null,
            createdAt: agora, updatedAt: agora
        } });
        const filialId = randomUUID();
        await tx.branch.create({ data: { id: filialId, companyId: empresaId, name: 'MATRIZ', isActive: true, createdAt: agora, updatedAt: agora } });
        await tx.user.create({ data: {
            id: randomUUID(), companyId: empresaId, branchId: filialId, name: String(b.adminNome || 'ADMINISTRADOR').trim().toUpperCase(),
            email: adminEmail, password: hash, role: 'ADMIN', isActive: true, mustChangePassword: true,
            passwordChangedAt: agora, createdAt: agora, updatedAt: agora
        } });
    }));
    await gravarContrato(empresaId, contrato);

    // Primeira mensalidade (opcional)
    if (b.primeiroVencimento && contrato.valorMensal > 0) {
        const venc = String(b.primeiroVencimento).slice(0, 10);
        await sistema(() => prisma.saasCobranca.create({ data: {
            id: randomUUID(), companyId: empresaId, competencia: venc.slice(0, 7), descricao: `Mensalidade ${venc.slice(5, 7)}/${venc.slice(0, 4)}`,
            vencimento: new Date(venc + 'T00:00:00Z'), valor: contrato.valorMensal
        } }));
        await sincronizarVencimento(empresaId);
    }
    await nota(empresaId, 'SISTEMA', `Cliente cadastrado no plano ${plano?.nome ?? 'personalizado'} (${contrato.valorMensal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês). Administrador: ${adminEmail}.`);
    const [cliente] = await montarClientes([empresaId]);
    return res.status(201).json({ ...cliente, credenciais: { email: adminEmail, senha } });
}));

router.put('/clientes/:id', h(async (req, res) => {
    const id = req.params.id;
    const b = req.body || {};
    const empresa = await sistema(() => prisma.company.findUnique({ where: { id } }));
    if (!empresa) throw falha(404, 'Cliente não encontrado!');
    const dados: any = { updatedAt: new Date() };
    if (b.nome !== undefined) { if (!String(b.nome).trim()) throw falha(400, 'Informe a razão social!'); dados.name = String(b.nome).trim(); }
    if (b.fantasia !== undefined) dados.tradeName = String(b.fantasia).trim() || dados.name || empresa.name;
    if (b.cnpj !== undefined) {
        const d = soDigitos(b.cnpj);
        if (d.length !== 14 && d.length !== 11) throw falha(400, 'CNPJ/CPF inválido.');
        dados.document = d;
    }
    for (const [campo, col] of [['email', 'email'], ['telefone', 'phone'], ['cidade', 'city']] as const) {
        if (b[campo] !== undefined) dados[col] = String(b[campo]).trim() || null;
    }
    if (b.uf !== undefined) dados.state = String(b.uf).trim().toUpperCase().slice(0, 2) || null;
    await sistema(() => prisma.company.update({ where: { id }, data: dados }));

    const c = await lerContrato(id);
    const novo = normalizarContrato({
        ...c,
        valorMensal: b.valor !== undefined ? num(b.valor) : c.valorMensal,
        diaVencimento: b.diaVencimento !== undefined ? b.diaVencimento : c.diaVencimento,
        toleranciaDias: b.toleranciaDias !== undefined ? b.toleranciaDias : c.toleranciaDias,
        bloqueioAutomatico: b.bloqueioAutomatico !== undefined ? !!b.bloqueioAutomatico : c.bloqueioAutomatico
    });
    await gravarContrato(id, novo);
    const [cliente] = await montarClientes([id]);
    return res.json(cliente);
}));

router.get('/clientes/:id/modulos', h(async (req, res) => {
    const c = await lerContrato(req.params.id);
    return res.json({
        planoId: c.planoId, segmento: c.segmento, modulos: c.modulos ?? modulosPadrao(), personalizado: c.personalizado,
        limiteUsuarios: c.limites.usuarios || null, limiteCaixas: c.limites.caixas || null,
        cobranca: resumoCobranca(c, await lerPlanos())
    });
}));

router.put('/clientes/:id/modulos', h(async (req, res) => {
    const id = req.params.id;
    const existe = await sistema(() => prisma.company.findUnique({ where: { id }, select: { id: true } }));
    if (!existe) throw falha(404, 'Cliente não encontrado!');
    const { planoId, segmento, modulos: lista, limiteUsuarios, limiteCaixas, atualizarValor } = req.body || {};
    const dados = await lerPlanos();
    const c = await lerContrato(id);
    const plano = planoId ? dados.planos.find(p => p.id === planoId) : null;
    if (planoId && !plano) throw falha(400, 'Plano inválido!');
    if (segmento !== undefined && !SEGMENTOS.includes(segmento)) throw falha(400, 'Segmento inválido!');
    if (lista !== undefined && !Array.isArray(lista)) throw falha(400, 'Lista de módulos inválida!');
    const validas = chavesValidas();
    const mods = lista !== undefined ? [...new Set<string>(lista.filter((m: string) => validas.has(m)))] : (c.modulos ?? modulosPadrao());
    const personalizado = !plano || [...plano.modulos].sort().join() !== [...mods].sort().join();
    const lim = (v: any, padrao: number) => (v === '' || v === null || v === undefined ? padrao : Math.max(0, Math.round(num(v))));
    const novo: Contrato = {
        ...c,
        planoId: plano?.id ?? null, plano: plano?.nome ?? null,
        segmento: segmento ?? c.segmento, modulos: mods, personalizado,
        limites: { usuarios: lim(limiteUsuarios, plano?.usuarios ?? 0), caixas: lim(limiteCaixas, plano?.caixas ?? 0) }
    };
    const cobranca = resumoCobranca(novo, dados);
    if (atualizarValor !== false) novo.valorMensal = cobranca.total;
    await gravarContrato(id, novo);
    await nota(id, 'SISTEMA', `Módulos atualizados: ${mods.length} liberado(s), plano ${plano?.nome ?? 'personalizado'}, valor ${novo.valorMensal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês.`);
    return res.json({ ok: true, cobranca, contrato: novo });
}));

router.post('/clientes/:id/suspender', h(async (req, res) => {
    const id = req.params.id;
    const c = await lerContrato(id);
    await gravarContrato(id, { ...c, status: 'SUSPENSO' });
    // derruba as sessões abertas do cliente
    await sistema(() => prisma.user.updateMany({ where: { companyId: id }, data: { sessionToken: null, sessionExpiresAt: null } }));
    await nota(id, 'SISTEMA', `Acesso suspenso.${req.body?.motivo ? ' Motivo: ' + String(req.body.motivo) : ''}`);
    return res.json({ ok: true });
}));

router.post('/clientes/:id/reativar', h(async (req, res) => {
    const id = req.params.id;
    const c = await lerContrato(id);
    await gravarContrato(id, { ...c, status: 'ATIVO' });
    await nota(id, 'SISTEMA', 'Acesso reativado.');
    return res.json({ ok: true, aviso: motivoBloqueio({ ...c, status: 'ATIVO' }) });
}));

router.post('/clientes/:id/resetar-senha', h(async (req, res) => {
    const id = req.params.id;
    const admin = await sistema(() => prisma.user.findFirst({ where: { companyId: id, role: 'ADMIN' }, orderBy: { createdAt: 'asc' } }));
    if (!admin) throw falha(404, 'O cliente não tem administrador cadastrado.');
    const senha = gerarSenha();
    await sistema(() => prisma.user.update({ where: { id: admin.id }, data: {
        password: bcrypt.hashSync(senha, 10), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null,
        sessionToken: null, sessionExpiresAt: null, passwordChangedAt: new Date(), isActive: true, updatedAt: new Date()
    } }));
    await nota(id, 'SISTEMA', `Senha do administrador (${admin.email}) redefinida pelo painel.`);
    return res.json({ email: admin.email, senha });
}));

// Remove todos os dados de uma empresa, das tabelas filhas para as mães (algumas
// chaves estrangeiras não têm cascata, ex.: item de compra → produto).
async function excluirEmpresa(id: string) {
    const c = { companyId: id };
    await sistema(() => prisma.$transaction(async (tx) => {
        const venda = { Sale: c }, cliente = { Customer: c };
        await tx.saleItem.deleteMany({ where: venda });
        await tx.salePayment.deleteMany({ where: venda });
        await tx.saleInstallment.deleteMany({ where: venda });
        await tx.nfeEvent.deleteMany({ where: venda });
        await tx.cardStatementLine.deleteMany({ where: { CardStatementImport: c } });
        await tx.financialTransaction.deleteMany({ where: c });
        await tx.cardReceivable.deleteMany({ where: c });
        await tx.loyaltyPoint.deleteMany({ where: cliente });
        await tx.cashbackBalance.deleteMany({ where: cliente });
        await tx.creditScore.deleteMany({ where: cliente });
        await tx.inventoryCountItem.deleteMany({ where: { InventoryCount: c } });
        await tx.inventoryCount.deleteMany({ where: c });
        await tx.inventoryMovement.deleteMany({ where: { Inventory: { Branch: c } } });
        await tx.inventory.deleteMany({ where: { Branch: c } });
        await tx.purchaseItem.deleteMany({ where: { Purchase: c } });
        await tx.purchase.deleteMany({ where: c });
        await tx.priceTableItem.deleteMany({ where: { PriceTable: c } });
        await tx.promotionProduct.deleteMany({ where: { Promotion: c } });
        await tx.promotion.deleteMany({ where: c });
        await tx.cashMovement.deleteMany({ where: { CashRegister: c } });
        await tx.cashRegister.deleteMany({ where: c });
        await tx.sale.deleteMany({ where: c });
        await tx.customer.updateMany({ where: c, data: { priceTableId: null } });
        await tx.priceTable.deleteMany({ where: c });
        await tx.cardOperatorFee.deleteMany({ where: { CardOperator: c } });
        await tx.cardStatementImport.deleteMany({ where: c });
        await tx.cardOperator.deleteMany({ where: c });
        await tx.cardBrand.deleteMany({ where: c });
        await tx.productVariant.deleteMany({ where: { Product: c } });
        await tx.product.deleteMany({ where: c });
        await tx.customer.deleteMany({ where: c });
        await tx.supplier.deleteMany({ where: c });
        await tx.category.updateMany({ where: c, data: { parentId: null } });
        await tx.category.deleteMany({ where: c });
        await tx.brand.deleteMany({ where: c });
        await tx.collection.deleteMany({ where: c });
        await tx.employee.deleteMany({ where: c });
        await tx.auditLog.deleteMany({ where: { User: c } });
        await tx.loginAudit.deleteMany({ where: c });
        await tx.setting.deleteMany({ where: c });
        await tx.user.deleteMany({ where: c });
        await tx.branch.deleteMany({ where: c });
        await tx.saasCobranca.deleteMany({ where: c });
        await tx.saasNota.deleteMany({ where: c });
        await tx.company.delete({ where: { id } });
    }, { timeout: 120_000 }));
}

router.delete('/clientes/:id', h(async (req, res) => {
    const id = req.params.id;
    const empresa = await sistema(() => prisma.company.findUnique({ where: { id } }));
    if (!empresa) throw falha(404, 'Cliente não encontrado!');
    if (soDigitos(req.body?.confirmacao) !== empresa.document) throw falha(400, 'Para excluir, digite o CNPJ/CPF do cliente para confirmar.');
    await excluirEmpresa(id);
    esquecerContrato(id);
    return res.json({ ok: true });
}));

router.post('/clientes/:id/notas', h(async (req, res) => {
    const texto = String(req.body?.texto || '').trim();
    if (!texto) throw falha(400, 'Escreva a anotação.');
    const tipo = ['NOTA', 'CONTATO', 'COBRANCA'].includes(req.body?.tipo) ? req.body.tipo : 'NOTA';
    await nota(req.params.id, tipo, texto);
    return res.json({ ok: true });
}));

// ---------------------------------------------------------------- financeiro
router.get('/financeiro', h(async (req, res) => {
    const competencia = /^\d{4}-\d{2}$/.test(String(req.query.competencia || '')) ? String(req.query.competencia) : competenciaAtual();
    const [clientes, todas] = await Promise.all([
        montarClientes(),
        sistema(() => prisma.saasCobranca.findMany({ orderBy: { vencimento: 'asc' } }))
    ]);
    const nomes = new Map(clientes.map(c => [c.id, c.fantasia || c.nome]));
    const ativos = clientes.filter(c => c.status === 'ATIVO');
    const doMes = todas.filter(c => c.competencia === competencia && c.status !== 'CANCELADO');
    const hoje = hojeISO();
    const vencidas = todas.filter(c => c.status === 'PENDENTE' && dia(c.vencimento)! < hoje);
    const mesHoje = hoje.slice(0, 7);
    const recebidoMes = todas.filter(c => c.status === 'PAGO' && dia(c.pagoEm)?.slice(0, 7) === competencia).reduce((s, c) => s + num(c.valorPago ?? c.valor), 0);
    const previsto = doMes.reduce((s, c) => s + num(c.valor), 0);
    const pagoCompetencia = doMes.filter(c => c.status === 'PAGO').reduce((s, c) => s + num(c.valorPago ?? c.valor), 0);
    // Receita dos últimos 6 meses (recebido x previsto)
    const meses: string[] = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(Date.parse(mesHoje + '-15T00:00:00Z')); d.setUTCMonth(d.getUTCMonth() - i); meses.push(d.toISOString().slice(0, 7)); }
    const historico = meses.map(m => ({
        competencia: m,
        previsto: +todas.filter(c => c.competencia === m && c.status !== 'CANCELADO').reduce((s, c) => s + num(c.valor), 0).toFixed(2),
        recebido: +todas.filter(c => c.competencia === m && c.status === 'PAGO').reduce((s, c) => s + num(c.valorPago ?? c.valor), 0).toFixed(2)
    }));
    const contagem = (s: string) => clientes.filter(c => c.saude.situacao === s).length;
    return res.json({
        competencia,
        kpis: {
            mrr: +ativos.reduce((s, c) => s + c.contrato.valorMensal, 0).toFixed(2),
            clientesAtivos: ativos.length,
            previstoMes: +previsto.toFixed(2),
            pagoCompetencia: +pagoCompetencia.toFixed(2),
            recebidoNoMes: +recebidoMes.toFixed(2),
            aReceber: +doMes.filter(c => c.status === 'PENDENTE').reduce((s, c) => s + num(c.valor), 0).toFixed(2),
            vencido: +vencidas.reduce((s, c) => s + num(c.valor), 0).toFixed(2),
            inadimplencia: previsto ? +((doMes.filter(c => c.status === 'PENDENTE' && dia(c.vencimento)! < hoje).reduce((s, c) => s + num(c.valor), 0) / previsto) * 100).toFixed(1) : 0,
            emDia: contagem('EM_DIA'), atrasados: contagem('ATRASADO'), inadimplentes: contagem('INADIMPLENTE'), semCobranca: contagem('SEM_COBRANCA'),
            bloqueados: clientes.filter(c => c.bloqueio).length,
            semMensalidadeNoMes: ativos.filter(c => c.contrato.valorMensal > 0 && !doMes.some(x => x.companyId === c.id)).length
        },
        historico,
        cobrancas: doMes.map(c => ({ ...serializarCobranca(c), cliente: nomes.get(c.companyId) || '—' })),
        vencidas: vencidas.map(c => ({ ...serializarCobranca(c), cliente: nomes.get(c.companyId) || '—' }))
    });
}));

// Gera as mensalidades da competência para todos os clientes ativos com valor mensal.
router.post('/financeiro/gerar', h(async (req, res) => {
    const competencia = /^\d{4}-\d{2}$/.test(String(req.body?.competencia || '')) ? String(req.body.competencia) : competenciaAtual();
    const clientes = (await montarClientes()).filter(c => c.status === 'ATIVO' && c.contrato.valorMensal > 0);
    const existentes = await sistema(() => prisma.saasCobranca.findMany({ where: { competencia }, select: { companyId: true } }));
    const ja = new Set(existentes.map(e => e.companyId));
    let criadas = 0;
    for (const c of clientes) {
        if (ja.has(c.id)) continue;
        const venc = dataDoVencimento(competencia, c.contrato.diaVencimento);
        await sistema(() => prisma.saasCobranca.create({ data: {
            id: randomUUID(), companyId: c.id, competencia, descricao: `Mensalidade ${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`,
            vencimento: new Date(venc + 'T00:00:00Z'), valor: c.contrato.valorMensal
        } }));
        await sincronizarVencimento(c.id);
        criadas++;
    }
    return res.json({ ok: true, competencia, criadas });
}));

router.post('/cobrancas', h(async (req, res) => {
    const b = req.body || {};
    const empresa = await sistema(() => prisma.company.findUnique({ where: { id: String(b.companyId || '') } }));
    if (!empresa) throw falha(404, 'Cliente não encontrado!');
    const venc = String(b.vencimento || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) throw falha(400, 'Informe o vencimento.');
    if (!(num(b.valor) > 0)) throw falha(400, 'Informe o valor.');
    const competencia = /^\d{4}-\d{2}$/.test(String(b.competencia || '')) ? String(b.competencia) : venc.slice(0, 7);
    const cob = await sistema(() => prisma.saasCobranca.create({ data: {
        id: randomUUID(), companyId: empresa.id, competencia, descricao: String(b.descricao || '').trim() || `Mensalidade ${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`,
        vencimento: new Date(venc + 'T00:00:00Z'), valor: num(b.valor), observacao: b.observacao ? String(b.observacao) : null
    } }));
    await sincronizarVencimento(empresa.id);
    return res.status(201).json(serializarCobranca(cob));
}));

async function cobrancaOu404(id: string) {
    const c = await sistema(() => prisma.saasCobranca.findUnique({ where: { id } }));
    if (!c) throw falha(404, 'Cobrança não encontrada!');
    return c;
}

router.put('/cobrancas/:id', h(async (req, res) => {
    const c = await cobrancaOu404(req.params.id);
    const b = req.body || {};
    const dados: any = {};
    if (b.valor !== undefined) { if (!(num(b.valor) > 0)) throw falha(400, 'Valor inválido.'); dados.valor = num(b.valor); }
    if (b.vencimento) dados.vencimento = new Date(String(b.vencimento).slice(0, 10) + 'T00:00:00Z');
    if (b.descricao !== undefined) dados.descricao = String(b.descricao).trim() || null;
    if (b.observacao !== undefined) dados.observacao = String(b.observacao).trim() || null;
    const novo = await sistema(() => prisma.saasCobranca.update({ where: { id: c.id }, data: dados }));
    await sincronizarVencimento(c.companyId);
    return res.json(serializarCobranca(novo));
}));

router.post('/cobrancas/:id/pagar', h(async (req, res) => {
    const c = await cobrancaOu404(req.params.id);
    if (c.status === 'PAGO') throw falha(400, 'Esta cobrança já está paga.');
    const b = req.body || {};
    const pagoEm = /^\d{4}-\d{2}-\d{2}$/.test(String(b.pagoEm || '')) ? new Date(b.pagoEm + 'T12:00:00Z') : new Date();
    const forma = FORMAS.includes(b.formaPagamento) ? b.formaPagamento : 'PIX';
    const valorPago = b.valorPago !== undefined && b.valorPago !== '' ? num(b.valorPago) : num(c.valor);
    const novo = await sistema(() => prisma.saasCobranca.update({ where: { id: c.id }, data: {
        status: 'PAGO', pagoEm, valorPago, formaPagamento: forma, observacao: b.observacao ? String(b.observacao) : c.observacao
    } }));
    await sincronizarVencimento(c.companyId);
    await nota(c.companyId, 'COBRANCA', `Pagamento registrado: ${c.descricao || c.competencia} — ${valorPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} via ${forma}.`);
    return res.json(serializarCobranca(novo));
}));

router.post('/cobrancas/:id/reabrir', h(async (req, res) => {
    const c = await cobrancaOu404(req.params.id);
    const novo = await sistema(() => prisma.saasCobranca.update({ where: { id: c.id }, data: { status: 'PENDENTE', pagoEm: null, valorPago: null, formaPagamento: null } }));
    await sincronizarVencimento(c.companyId);
    await nota(c.companyId, 'COBRANCA', `Cobrança reaberta: ${c.descricao || c.competencia}.`);
    return res.json(serializarCobranca(novo));
}));

router.post('/cobrancas/:id/cancelar', h(async (req, res) => {
    const c = await cobrancaOu404(req.params.id);
    const novo = await sistema(() => prisma.saasCobranca.update({ where: { id: c.id }, data: { status: 'CANCELADO' } }));
    await sincronizarVencimento(c.companyId);
    await nota(c.companyId, 'COBRANCA', `Cobrança cancelada: ${c.descricao || c.competencia}.${req.body?.motivo ? ' Motivo: ' + String(req.body.motivo) : ''}`);
    return res.json(serializarCobranca(novo));
}));

export default router;
