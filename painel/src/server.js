// Painel de Gestão JG Sistemas - servidor
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const config = require('./config');
const store = require('./store');
const orc = require('./orquestrador');
const modulos = require('./modulos');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
app.use(express.json({ limit: '100kb' }));

// Headers de segurança. Sem CORS: frontend e API são servidos na mesma origem
// e a sessão usa cookie httpOnly (não funciona entre origens de qualquer forma).
app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'"
    ].join('; '));
    next();
});

// Bloqueio de crawlers de IA/LLM e scrapers (defesa em profundidade).
const BOTS_IA = new RegExp([
    'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'OpenAI-ImageBot', 'gpt-',
    'ClaudeBot', 'anthropic-ai', 'Claude-Web', 'PerplexityBot', 'Perplexity-User',
    'CCBot', 'Common Crawl', 'Google-Extended', 'GoogleGeminiAI', 'Google-CloudVertexBot',
    'Bytespider', 'Amazonbot', 'Applebot-Extended', 'FacebookBot', 'Meta-ExternalAgent', 'Meta-Exporter',
    'cohere-ai', 'DataForSeoBot', 'PetalBot', 'Diffbot', 'ImagesiftBot', 'youBot', 'omgili',
    'AI2Bot', 'AI2Bot-Dolma', 'Scrapy', 'python-urllib', 'Python-requests', 'Go-http-client',
    'Wget', 'libwww-perl', 'HeadlessChrome', 'PhantomJS', 'Selenium', 'sqlmap', 'nmap',
    'Nikto', 'Zmeu', 'masscan', 'zgrab', 'Zeus', 'python-httpx'
].join('|'), 'i');

app.use((req, res, next) => {
    const ua = String(req.headers['user-agent'] || '');
    if (ua && BOTS_IA.test(ua)) return res.status(403).send('Acesso negado.');
    next();
});

// robots.txt: sistema privado, desautoriza indexação.
app.get('/robots.txt', (_req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

// Guarda contra injeção de código (SQLi/XSS) em query, corpo e parâmetros.
const CAMPOS_IGNORADOS = /senha|password|novaSenha|senhaAtual|token|imagem|foto|base64|arquivo|assinatura|xml|pdf/i;
const PADROES_INJECAO = [
    /<\s*\/?\s*(?:script|iframe|object|embed|svg|math|style)\b/i,
    /\bjavascript:\s*/i,
    /data:\s*text\/html/i,
    /['"`]\s*(?:or|and)\s+(?:['"`]?\d{1,3}|['"`][^'"`]{1,40}['"`])\s*(?:--|#|\/)/i,
    /;\s*(?:drop|truncate|delete\s+from|insert\s+into|update\s+\w+\s+set|alter\s+table|create\s+table|exec|execute|xp_cmdshell|grant)\b/i,
    /union\s+(?:all\s+)?select\b/i,
    /\bsleep\s*\(\s*\d+/i,
    /\b(?:information_schema|pg_catalog)\b|sqlite_master/i,
    /\bon(?:error|load|click|dblclick|mouseover|mouseout|focus|blur|keydown|keyup|change|submit|auxclick|pointerdown)\s*=/i,
    /document\.(?:write|cookie)\s*\(|\.innerHTML\s*=|eval\s*\(|setTimeout\s*\(\s*['"`]/i
];

function escanearInjecao(valor, chave) {
    if (typeof valor === 'string') {
        if (CAMPOS_IGNORADOS.test(chave)) return false;
        return PADROES_INJECAO.some((p) => p.test(valor));
    }
    if (Array.isArray(valor)) return valor.some((v) => escanearInjecao(v, chave));
    if (valor && typeof valor === 'object') {
        return Object.keys(valor).some((k) => escanearInjecao(valor[k], k));
    }
    return false;
}

app.use('/api', (req, res, next) => {
    for (const parte of [req.query, req.body, req.params]) {
        if (parte && escanearInjecao(parte, '')) {
            return res.status(400).json({ erro: 'Requisição rejeitada: conteúdo suspeito detectado.' });
        }
    }
    next();
});

// Rate limit do login (anti força bruta, por IP).
const tentativas = new Map();
app.use('/api/login', (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || '0.0.0.0';
    const agora = Date.now();
    const lista = (tentativas.get(ip) || []).filter((t) => agora - t < 60000);
    if (lista.length >= 10) {
        res.set('Retry-After', '60');
        return res.status(429).json({ erro: 'Muitas tentativas de login. Aguarde um minuto.' });
    }
    lista.push(agora);
    tentativas.set(ip, lista);
    next();
});
setInterval(() => {
    const agora = Date.now();
    for (const [ip, lista] of tentativas) {
        tentativas.set(ip, lista.filter((t) => agora - t < 60000));
    }
}, 60000).unref();

app.use(express.static(config.FRONTEND, { dotfiles: 'ignore' }));
// Design system compartilhado com o ERP (CSS, fontes)
app.use('/ui', express.static(path.join(config.RAIZ, 'frontend', 'ui'), { dotfiles: 'ignore' }));

app.get('/', (_req, res) => res.redirect('/painel.html'));

// ---- Sessões simples (em memória) ----
const sessoes = new Set();

function gerarToken() { return crypto.randomBytes(32).toString('hex'); }

// Lê um cookie sem dependências externas.
function cookieVal(req, nome) {
    const raw = req.headers.cookie || '';
    const m = raw.match(new RegExp('(?:^|;\\s*)' + nome + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
}

function exigirPainel(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ')
        ? header.slice(7)
        : cookieVal(req, 'jg_painel_sessao');
    if (!token || !sessoes.has(token)) {
        return res.status(401).json({ erro: 'Não autenticado no painel!' });
    }
    next();
}

function novaSenhaCliente() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < 8; i++) s += chars[crypto.randomInt(chars.length)];
    return s;
}

function proximaPorta() {
    const usadas = new Set(store.lerClientes().map((c) => c.porta));
    let porta = config.PORTA_INICIAL_CLIENTES;
    while (usadas.has(porta)) porta++;
    return porta;
}

function slugDe(nome) {
    return nome
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '')
        .slice(0, 20) || `cliente${Date.now()}`;
}

// Remove qualquer senha dos dados retornados/persistidos. Senha de cliente só é
// devolvida UMA vez, na resposta do provisionamento (nunca gravada em disco).
function semSenha(cliente) {
    const { adminSenha, ...resto } = cliente || {};
    return resto;
}

// Dados da mensalidade
function vencimentoVencido(c) {
    if (!c.vencimento) return false;
    const fim = new Date(`${c.vencimento.slice(0, 10)}T00:00:00`);
    fim.setHours(fim.getHours() + config.JANELA_GRACE_HORAS);
    return Date.now() > fim.getTime();
}

// Remove a porta que ficou presa no cliente (limpa estados órfãos de instâncias que
// rodavam a versão antiga sem env de mensalidade quando o vencimento é removido).
function limparVencimento(cliente) {
    delete cliente.vencimento;
}

// ---- Rotas ----

// POST /api/login - autentica no painel (senha única do dono)
app.post('/api/login', async (req, res) => {
    const { senha } = req.body;
    if (!senha) return res.status(400).json({ erro: 'Informe a senha!' });

    let hashAtual = null;
    try { hashAtual = fs.readFileSync(config.ARQUIVO_SENHA, 'utf8'); } catch (e) { hashAtual = null; }

    // Primeira execução: cria a senha padrão (aleatória ou PAINEL_SENHA) e imprime
    if (!hashAtual) {
        fs.mkdirSync(config.DADOS, { recursive: true });
        const senhaInicial = config.SENHA_PADRAO;
        fs.writeFileSync(config.ARQUIVO_SENHA, await bcrypt.hash(senhaInicial, 10), 'utf8');
        hashAtual = fs.readFileSync(config.ARQUIVO_SENHA, 'utf8');
        console.log(`🔐 Painel configurado. SENHA INICIAL (guarde e troque): ${senhaInicial}`);
    }

    const ok = await bcrypt.compare(String(senha), hashAtual);
    if (!ok) return res.status(401).json({ erro: 'Senha incorreta!' });

    const token = gerarToken();
    sessoes.add(token);
    // Sessão em cookie httpOnly: o token não fica acessível ao JavaScript.
    res.cookie('jg_painel_sessao', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https'),
        path: '/'
    });
    return res.json({ ok: true });
});

// POST /api/logout - encerra a sessão do painel
app.post('/api/logout', exigirPainel, (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : cookieVal(req, 'jg_painel_sessao');
    if (token) sessoes.delete(token);
    res.clearCookie('jg_painel_sessao', { path: '/' });
    return res.json({ ok: true });
});

// GET /api/clientes - lista clientes com status da instância
app.get('/api/clientes', exigirPainel, async (_req, res) => {
    const lista = [];
    for (const c of store.lerClientes()) {
        const ocupada = await orc.portaOcupada(c.porta);
        const limpo = semSenha(c);
        if (c.tipo === 'escola') {
            lista.push({
                ...limpo,
                rodando: orc.escolaRodando(c.id) || (ocupada && c.status === 'ATIVO'),
                bloqueado: false
            });
            continue;
        }
        lista.push({
            ...limpo,
            modulosAtivos: modulos.modulosDoCliente(c).length,
            modulosTotal: modulos.catalogo().filter((m) => !m.futuro).length,
            rodando: orc.instanciaRodando(c.id) || (ocupada && c.status === 'ATIVO'),
            bloqueado: orc.bloqueioAtivo(c.id) || (ocupada && c.status === 'SUSPENSO')
        });
    }
    return res.json(lista);
});

// POST /api/clientes - cadastra um cliente (sem provisionar)
app.post('/api/clientes', exigirPainel, (req, res) => {
    const { nome, fantasia, cnpj, plano, valor, vencimento, planoId, segmento } = req.body || {};
    if (!nome || !nome.trim()) return res.status(400).json({ erro: 'Informe o nome do cliente!' });
    const planoEscolhido = modulos.lerPlanos().planos.find((p) => p.id === planoId) || null;

    const id = crypto.randomUUID();
    const slug = slugDe(nome);
    const cliente = {
        id,
        nome: nome.trim(),
        fantasia: fantasia || nome.trim(),
        cnpj: String(cnpj || '').replace(/\D/g, ''),
        plano: plano || 'MENSAL',
        valor: Number(valor) || 0,
        banco: orc.dbNome(slug),
        slug,
        porta: proximaPorta(),
        status: 'CADASTRADO',
        adminEmail: null,
        adminSenha: null,
        criadoEm: new Date().toISOString(),
        vencimento: vencimento ? String(vencimento).slice(0, 10) : null,
        planoId: planoEscolhido ? planoEscolhido.id : null,
        segmento: ['VAREJO', 'MODA', 'SALAO'].includes(segmento) ? segmento : 'MODA',
        modulos: planoEscolhido ? [...planoEscolhido.modulos] : undefined,
        modulosPersonalizados: false
    };
    if (planoEscolhido && !(Number(valor) > 0)) cliente.valor = planoEscolhido.valor;

    const lista = store.lerClientes();
    if (lista.some((c) => c.banco === cliente.banco)) {
        return res.status(400).json({ erro: `Já existe um cliente com banco ${cliente.banco}!` });
    }
    lista.push(cliente);
    store.salvarClientes(lista);
    return res.status(201).json(cliente);
});

// PUT /api/clientes/:id - edita dados do cliente (incluindo vencimento da mensalidade).
// Se o cliente está ATIVO e o vencimento mudou, reinicia a instância para propagar o
// novo env (MENSALIDADE_VENCIMENTO) ao ERP.
app.put('/api/clientes/:id', exigirPainel, async (req, res) => {
    const cliente = store.porId(req.params.id);
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado!' });

    const { nome, fantasia, cnpj, plano, valor, vencimento } = req.body || {};

    const mudouVencimento = (vencimento ?? null) !== (cliente.vencimento ?? null);
    const eraVencido = vencimentoVencido(cliente);

    if (nome !== undefined) {
        if (!String(nome).trim()) return res.status(400).json({ erro: 'Informe o nome do cliente!' });
        cliente.nome = String(nome).trim();
    }
    if (fantasia !== undefined) cliente.fantasia = String(fantasia).trim() || cliente.fantasia;
    if (cnpj !== undefined) cliente.cnpj = String(cnpj).replace(/\D/g, '');
    if (plano !== undefined) cliente.plano = plano || 'MENSAL';
    if (valor !== undefined) cliente.valor = Number(valor) || 0;
    if (vencimento !== undefined) {
        if (vencimento) {
            cliente.vencimento = String(vencimento).slice(0, 10);
        } else {
            limparVencimento(cliente);
        }
    }

    store.salvarClientes(store.lerClientes().map((c) => c.id === cliente.id ? cliente : c));

    // Cliente SUSPENSO que teve o vencimento corrigido volta a ser elegível? Não —
    // reativação continua manual. Mas se estava suspenso e vencimento removido, mantém SUSPENSO.
    if (mudouVencimento && cliente.status === 'ATIVO') {
        try {
            await orc.iniciarInstancia(cliente);
        } catch (e) {
            return res.status(500).json({ erro: 'Dados salvos, mas falha ao reiniciar a instância: ' + e.message });
        }
    }
    const vencido = vencimentoVencido(cliente);
    return res.json({ ...cliente, vencido, eraVencido });
});

// POST /api/clientes/:id/iniciar - (serviços tipo escola) sobe backend + frontend
app.post('/api/clientes/:id/iniciar', exigirPainel, async (req, res) => {
    const cliente = store.porId(req.params.id);
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado!' });
    if (cliente.tipo !== 'escola') return res.status(400).json({ erro: 'Use Provisionar/Reativar para clientes de ERP.' });

    try {
        const { logFile, adminSenha } = await orc.iniciarEscola(cliente);
        cliente.status = 'ATIVO';
        cliente.adminEmail = cliente.adminEmail || 'admin@escola.com';
        store.salvarClientes(store.lerClientes().map((c) => c.id === cliente.id ? cliente : c));

        const resposta = { ...semSenha(cliente), rodando: true, logFile };
        if (adminSenha) resposta.adminSenha = adminSenha; // devolvida uma única vez
        return res.json(resposta);
    } catch (e) {
        return res.status(500).json({ erro: 'Falha ao iniciar: ' + e.message });
    }
});

// POST /api/clientes/:id/parar - (serviços tipo escola) desliga backend + frontend
app.post('/api/clientes/:id/parar', exigirPainel, async (req, res) => {
    const cliente = store.porId(req.params.id);
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado!' });
    if (cliente.tipo !== 'escola') return res.status(400).json({ erro: 'Use Suspender para clientes de ERP.' });

    try {
        await orc.pararEscola(cliente.id);
        store.salvarClientes(store.lerClientes().map((c) => c.id === cliente.id ? cliente : c));
        return res.json({ ...semSenha(cliente), rodando: false });
    } catch (e) {
        return res.status(500).json({ erro: 'Falha ao parar: ' + e.message });
    }
});

// POST /api/clientes/:id/provisionar - cria banco, schema, admin e inicia a instância
app.post('/api/clientes/:id/provisionar', exigirPainel, async (req, res) => {
    const cliente = store.porId(req.params.id);
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado!' });
    if (cliente.tipo === 'escola') return res.status(400).json({ erro: 'Serviço interno: use Iniciar/Parar.' });

    try {
        const banco = cliente.banco;
        await orc.criarBanco(banco);

        const adminEmail = cliente.adminEmail || `admin@${cliente.slug}.com`;
        const adminSenha = novaSenhaCliente();

        await orc.dbPush(banco);
        await orc.provisionar(banco, {
            nome: cliente.nome,
            fantasia: cliente.fantasia,
            cnpj: cliente.cnpj,
            porta: cliente.porta,
            adminEmail,
            adminSenha
        });

        cliente.adminEmail = adminEmail;
        cliente.status = 'ATIVO';
        cliente.provisionadoEm = new Date().toISOString();
        delete cliente.adminSenha; // nunca gravar a senha em disco — só é devolvida 1x na resposta
        store.salvarClientes(store.lerClientes().map((c) => c.id === cliente.id ? cliente : c));

        const logFile = await orc.iniciarInstancia(cliente);

        return res.json({ ...semSenha(cliente), rodando: true, logFile, adminSenha });
    } catch (e) {
        return res.status(500).json({ erro: 'Falha ao provisionar: ' + e.message });
    }
});

// POST /api/clientes/:id/suspender - bloqueia o acesso (sobe página de aviso na porta do cliente)
app.post('/api/clientes/:id/suspender', exigirPainel, async (req, res) => {
    const cliente = store.porId(req.params.id);
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado!' });
    if (cliente.tipo === 'escola') return res.status(400).json({ erro: 'Serviço interno: use Iniciar/Parar.' });

    try {
        await orc.iniciarBloqueio(cliente);
        cliente.status = 'SUSPENSO';
        store.salvarClientes(store.lerClientes().map((c) => c.id === cliente.id ? cliente : c));
        return res.json({ ...cliente, rodando: false, bloqueado: true });
    } catch (e) {
        return res.status(500).json({ erro: 'Falha ao suspender: ' + e.message });
    }
});

// POST /api/clientes/:id/reativar - sobe a instância novamente
app.post('/api/clientes/:id/reativar', exigirPainel, async (req, res) => {
    const cliente = store.porId(req.params.id);
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado!' });
    if (cliente.tipo === 'escola') return res.status(400).json({ erro: 'Serviço interno: use Iniciar/Parar.' });

    try {
        await orc.iniciarInstancia(cliente);
        cliente.status = 'ATIVO';
        store.salvarClientes(store.lerClientes().map((c) => c.id === cliente.id ? cliente : c));
        return res.json({ ...cliente, rodando: true, bloqueado: false });
    } catch (e) {
        return res.status(500).json({ erro: 'Falha ao reativar: ' + e.message });
    }
});

// DELETE /api/clientes/:id - remove o cadastro (opcional)
app.delete('/api/clientes/:id', exigirPainel, async (req, res) => {
    const cliente = store.porId(req.params.id);
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado!' });
    if (cliente.tipo === 'escola') {
        await orc.pararEscola(cliente.id);
    } else {
        await orc.pararInstancia(cliente.id, cliente.porta);
    }
    store.salvarClientes(store.lerClientes().filter((c) => c.id !== cliente.id));
    return res.json({ ok: true });
});

// ---- Planos e módulos ----

// GET /api/catalogo - módulos do ERP + planos comerciais
app.get('/api/catalogo', exigirPainel, (_req, res) => {
    const dados = modulos.lerPlanos();
    return res.json({
        modulos: modulos.catalogo().map((m) => ({ ...m, precoAdicional: modulos.precoAdicional(m.chave, dados) })),
        planos: dados.planos,
        adicionais: dados.adicionais
    });
});

// PUT /api/planos - salva os planos e a matriz de módulos por plano
app.put('/api/planos', exigirPainel, (req, res) => {
    const { planos, adicionais } = req.body || {};
    if (!Array.isArray(planos) || !planos.length) return res.status(400).json({ erro: 'Informe ao menos um plano!' });
    const ids = planos.map((p) => String(p.id || '').trim()).filter(Boolean);
    if (new Set(ids).size !== ids.length) return res.status(400).json({ erro: 'Há planos com o mesmo identificador!' });
    const salvo = modulos.salvarPlanos({ planos, adicionais });
    // Clientes que seguem o plano (sem ajuste manual) recebem a nova matriz na hora.
    const clientes = store.lerClientes();
    let alterados = 0;
    for (const c of clientes) {
        if (c.tipo === 'escola' || !c.planoId || c.modulosPersonalizados) continue;
        const p = salvo.planos.find((x) => x.id === c.planoId);
        if (!p) continue;
        c.modulos = [...p.modulos];
        alterados++;
        try { modulos.gravarLiberacao(c); } catch (e) { /* instância ainda não provisionada */ }
    }
    if (alterados) store.salvarClientes(clientes);
    return res.json({ ...salvo, clientesAtualizados: alterados });
});

// GET /api/clientes/:id/modulos - módulos liberados do cliente
app.get('/api/clientes/:id/modulos', exigirPainel, (req, res) => {
    const cliente = store.porId(req.params.id);
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado!' });
    return res.json({
        planoId: cliente.planoId || null,
        segmento: cliente.segmento || 'MODA',
        modulos: modulos.modulosDoCliente(cliente),
        personalizado: !!cliente.modulosPersonalizados,
        limiteUsuarios: cliente.limiteUsuarios ?? null,
        limiteCaixas: cliente.limiteCaixas ?? null,
        cobranca: modulos.resumoCobranca(cliente)
    });
});

// PUT /api/clientes/:id/modulos - libera/bloqueia módulos (vale na hora, sem reiniciar)
app.put('/api/clientes/:id/modulos', exigirPainel, (req, res) => {
    const cliente = store.porId(req.params.id);
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado!' });
    if (cliente.tipo === 'escola') return res.status(400).json({ erro: 'Serviço interno não usa módulos do ERP.' });

    const { planoId, segmento, modulos: lista, limiteUsuarios, limiteCaixas } = req.body || {};
    const planos = modulos.lerPlanos().planos;
    if (planoId !== undefined) {
        if (planoId && !planos.some((p) => p.id === planoId)) return res.status(400).json({ erro: 'Plano inválido!' });
        cliente.planoId = planoId || null;
    }
    if (segmento !== undefined) {
        if (!['VAREJO', 'MODA', 'SALAO'].includes(segmento)) return res.status(400).json({ erro: 'Segmento inválido!' });
        cliente.segmento = segmento;
    }
    if (lista !== undefined) {
        if (!Array.isArray(lista)) return res.status(400).json({ erro: 'Lista de módulos inválida!' });
        const validas = modulos.chavesValidas();
        const futuros = new Set(modulos.catalogo().filter((m) => m.futuro).map((m) => m.chave));
        cliente.modulos = [...new Set(lista.filter((m) => validas.has(m) && !futuros.has(m)))];
        const plano = planos.find((p) => p.id === cliente.planoId);
        const doPlano = plano ? plano.modulos.filter((m) => !futuros.has(m)).sort().join(',') : null;
        cliente.modulosPersonalizados = doPlano === null || doPlano !== [...cliente.modulos].sort().join(',');
    }
    const limite = (v) => (v === null || v === '' ? null : Math.max(0, Math.round(Number(v) || 0)));
    if (limiteUsuarios !== undefined) cliente.limiteUsuarios = limite(limiteUsuarios);
    if (limiteCaixas !== undefined) cliente.limiteCaixas = limite(limiteCaixas);

    const resumo = modulos.resumoCobranca(cliente);
    if (resumo.total > 0) cliente.valor = resumo.total;
    store.salvarClientes(store.lerClientes().map((c) => c.id === cliente.id ? cliente : c));
    try { modulos.gravarLiberacao(cliente); } catch (e) {
        return res.status(500).json({ erro: 'Salvo, mas falha ao gravar a liberação: ' + e.message });
    }
    return res.json({ ok: true, modulos: cliente.modulos, personalizado: cliente.modulosPersonalizados, cobranca: resumo });
});

// ---- Verificação automática de vencimento ----

// Suspende automaticamente clientes ATIVOS cuja mensalidade venceu há mais de
// JANELA_GRACE_HORAS. Retorna a lista de clientes suspensos neste ciclo.
async function suspenderVencidos(clientes) {
    const suspensos = [];
    for (const c of clientes) {
        if (c.status === 'ATIVO' && vencimentoVencido(c)) {
            try {
                await orc.iniciarBloqueio(c);
                c.status = 'SUSPENSO';
                suspensos.push(c.nome);
                console.log(`🔒 Auto-suspenso por vencimento da mensalidade: ${c.nome} (porta ${c.porta})`);
            } catch (e) {
                console.error(`Falha ao auto-suspender ${c.nome}: ${e.message}`);
            }
        }
    }
    if (suspensos.length) store.salvarClientes(clientes);
    return suspensos;
}

// Religa instâncias/bloqueios perdidos quando o painel sobe.
// Cliente ATIVO cuja mensalidade venceu há mais do que a janela é suspenso
// automaticamente em vez de ter a instância religada.
async function religar(clientes) {
    for (const c of clientes) {
        if (c.tipo === 'escola') {
            if (c.status === 'ATIVO' && !(await orc.portaOcupada(config.ESCOLA_PORTA_FRONTEND))) {
                try { await orc.iniciarEscola(c); console.log(`🎓 Escola religada: ${c.nome}`); } catch (e) { console.error(`Falha ao religar escola ${c.nome}: ${e.message}`); }
            }
            continue;
        }
        if (c.status === 'SUSPENSO') {
            await orc.matarPorta(c.porta);
            try { await orc.iniciarBloqueio(c); console.log(`🔒 Bloqueio religado: ${c.nome} (porta ${c.porta})`); } catch (e) { console.error(`Falha ao bloquear ${c.nome}: ${e.message}`); }
            continue;
        }
        if (c.status !== 'ATIVO') continue;
        if (vencimentoVencido(c)) {
            try {
                await orc.iniciarBloqueio(c);
                c.status = 'SUSPENSO';
                console.log(`🔒 Suspenso por vencimento no religar: ${c.nome} (porta ${c.porta})`);
            } catch (e) {
                console.error(`Falha ao suspender ${c.nome} no religar: ${e.message}`);
            }
            continue;
        }
        if (!(await orc.portaOcupada(c.porta))) {
            try { await orc.iniciarInstancia(c); console.log(`▶ Instância religada: ${c.nome} (porta ${c.porta})`); } catch (e) { console.error(`Falha ao religar ${c.nome}: ${e.message}`); }
        } else {
            console.log(`ℹ Instância já ativa na porta ${c.porta}: ${c.nome}`);
        }
    }
    store.salvarClientes(clientes);
}

setTimeout(async () => {
    // Limpeza de segurança: remove qualquer senha que tenha ficado gravada em clientes.json.
    const persistidos = store.lerClientes();
    let removeuSenha = false;
    for (const c of persistidos) {
        if ('adminSenha' in c) { delete c.adminSenha; removeuSenha = true; }
    }
    if (removeuSenha) {
        store.salvarClientes(persistidos);
        console.log('🔒 Removidas senhas de clientes que estavam gravadas em dados/clientes.json');
    }

    await religar(persistidos);
    // Verificação periódica: a cada minuto, suspende quem estiver com a mensalidade vencida.
    setInterval(async () => {
        try {
            const clientes = store.lerClientes();
            const suspensos = await suspenderVencidos(clientes);
            if (suspensos.length) console.log(`⏱ Auto-suspensão do ciclo: ${suspensos.join(', ')}`);
        } catch (e) {
            console.error('Falha no ciclo de verificação de vencimento:', e.message);
        }
    }, 60_000);
}, 1500);

app.listen(config.PORTA_PAINEL, () => {
    console.log(`🚀 Painel de Gestão JG rodando em http://localhost:${config.PORTA_PAINEL}`);
});
