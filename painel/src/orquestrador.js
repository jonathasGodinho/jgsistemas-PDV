// Orquestrador: cria bancos, roda db push/provisionar e gerencia processos das instâncias
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('./config');
const modulos = require('./modulos');

const processos = new Map(); // id -> ChildProcess
const bloqueadores = new Map(); // id -> ChildProcess
const servicosEscola = new Map(); // id -> { backend, frontend }

function dbNome(slug) {
    return `jg_${slug.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()}`;
}

// Cria o banco PostgreSQL do cliente (se ainda não existir)
function criarBanco(banco) {
    return new Promise((resolve, reject) => {
        const env = { ...process.env, PGPASSWORD: config.PG_PASSWORD };
        execFile(config.CREATEDB, ['-h', config.PG_HOST, '-p', String(config.PG_PORT), '-U', config.PG_USER, banco], { env }, (err, _stdout, stderr) => {
            if (err) {
                // Já existe -> erro 42P04 ("database already exists") / "já existe" (psql pt-BR)
                const msg = String(stderr || err.message || '').toLowerCase();
                if (msg.includes('42p04') || msg.includes('already exists') || msg.includes('já existe') || msg.includes('ja existe')) {
                    return resolve(false);
                }
                return reject(new Error(`Falha ao criar banco: ${stderr || err.message}`));
            }
            resolve(true);
        });
    });
}

function rodar(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: 'pipe', windowsHide: true });
        let out = '';
        let err = '';
        child.stdout.on('data', (d) => (out += d.toString()));
        child.stderr.on('data', (d) => (err += d.toString()));
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) resolve(out);
            else reject(new Error(err || out || `Comando falhou (${code})`));
        });
    });
}

// Aplica o schema no banco do cliente (prisma db push)
async function dbPush(banco) {
    const prismaBin = path.join(config.BACKEND, 'node_modules', 'prisma', 'build', 'index.js');
    const schema = path.join(config.BACKEND, 'prisma', 'schema.prisma');
    const out = await rodar(process.execPath, [prismaBin, 'db', 'push', '--accept-data-loss', '--schema', schema], {
        cwd: config.BACKEND,
        env: { ...process.env, DATABASE_URL: config.urlBanco(banco) }
    });
    return out;
}

// Roda o provisionar.ts (Company + Branch + admin) no banco do cliente
async function provisionar(banco, dados) {
    const src = path.join(config.BACKEND, 'src', 'provisionar.ts');
    const out = await rodar(process.execPath, ['-r', 'ts-node/register', src], {
        cwd: config.BACKEND,
        env: {
            ...process.env,
            DATABASE_URL: config.urlBanco(banco),
            PORT: String(dados.porta),
            EMPRESA_NOME: dados.nome,
            EMPRESA_FANTASIA: dados.fantasia || dados.nome,
            EMPRESA_DOCUMENTO: dados.cnpj || '00000000000000',
            ADMIN_EMAIL: dados.adminEmail,
            ADMIN_SENHA: dados.adminSenha,
            ADMIN_NOME: dados.adminNome || 'ADMINISTRADOR',
            TS_NODE_TRANSPILE_ONLY: '1'
        }
    });
    return out;
}

// Desliga o filho rastreado e ainda mata QUALQUER processo escutando na porta do cliente.
// Isso garante que a suspensão funcione mesmo para instâncias órfãs (iniciadas antes de o
// painel reiniciar ou fora dele), que não estão no mapa em memória `processos`.
function pararFilho(child) {
    if (!child) return;
    try { child.kill(); } catch (e) { /* ignora */ }
    if (process.platform === 'win32') {
        try { execFile('taskkill', ['/pid', String(child.pid), '/T', '/F']); } catch (e) { /* ignora */ }
    }
}

// Mata todos os processos que estão escutando na porta (Windows: netstat + taskkill).
// Usa a linha da tabela TCP, independe do idioma do netstat e ignora TIME_WAIT/CLOSE_WAIT.
function matarPorta(porta) {
    return new Promise((resolve) => {
        execFile('netstat', ['-ano', '-p', 'tcp'], (err, stdout) => {
            if (err) return resolve();
            const alvo = String(porta);
            const pids = new Set();
            for (const linhaRaw of String(stdout).split(/\r?\n/)) {
                const t = linhaRaw.trim().split(/\s+/);
                if (t.length < 5 || t[0].toUpperCase() !== 'TCP') continue;
                const portaLocal = (t[1] || '').split(':').pop();
                if (portaLocal !== alvo) continue;
                if (/TIME_WAIT|CLOSE_WAIT|SYN/i.test(linhaRaw)) continue;
                const pid = t[t.length - 1];
                if (/^\d+$/.test(pid) && Number(pid) > 0) pids.add(pid);
            }
            if (pids.size === 0) return resolve();
            let pend = pids.size;
            for (const pid of pids) {
                execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => { if (--pend === 0) resolve(); });
            }
        });
    });
}

// Verifica se há algo escutando na porta do cliente
function portaOcupada(porta) {
    return new Promise((resolve) => {
        execFile('netstat', ['-ano', '-p', 'tcp'], (err, stdout) => {
            if (err) return resolve(false);
            const alvo = String(porta);
            for (const linhaRaw of String(stdout).split(/\r?\n/)) {
                const t = linhaRaw.trim().split(/\s+/);
                if (t.length < 5 || t[0].toUpperCase() !== 'TCP') continue;
                if ((t[1] || '').split(':').pop() !== alvo) continue;
                if (/TIME_WAIT|CLOSE_WAIT|SYN/i.test(linhaRaw)) continue;
                if (/^\d+$/.test(t[t.length - 1]) && Number(t[t.length - 1]) > 0) return resolve(true);
            }
            return resolve(false);
        });
    });
}

async function iniciarInstancia(cliente) {
    pararFilho(processos.get(cliente.id));
    processos.delete(cliente.id);
    pararFilho(bloqueadores.get(cliente.id));
    bloqueadores.delete(cliente.id);
    await matarPorta(cliente.porta);

    const { cmd, args, env, cwd } = config.instanciaCmd(cliente.banco, cliente.porta, cliente);
    // Módulos liberados: a instância relê este arquivo sempre que ele muda.
    env.JG_MODULOS_ARQUIVO = modulos.gravarLiberacao(cliente);

    const logDir = path.join(config.DADOS, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `${cliente.id}.log`);
    const stream = fs.createWriteStream(logFile, { flags: 'a' });

    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    child.on('error', (e) => console.error(`Erro ao iniciar instância ${cliente.nome}: ${e.message}`));
    child.stdout.pipe(stream);
    child.stderr.pipe(stream);
    child.on('exit', () => { processos.delete(cliente.id); });
    processos.set(cliente.id, child);
    return logFile;
}

async function pararInstancia(id, porta) {
    pararFilho(processos.get(id));
    processos.delete(id);
    if (porta) await matarPorta(porta);
}

// Sobe o servidor de bloqueio na porta do cliente (substitui a instância ao suspender).
// Antes de subir, desliga qualquer instância/bloqueio rastreado e libera a porta.
async function iniciarBloqueio(cliente) {
    pararFilho(processos.get(cliente.id));
    processos.delete(cliente.id);
    pararFilho(bloqueadores.get(cliente.id));
    bloqueadores.delete(cliente.id);
    await matarPorta(cliente.porta);

    const bloqueadorJs = path.join(__dirname, 'bloqueador.js');
    const child = spawn(process.execPath, [bloqueadorJs], {
        env: {
            ...process.env,
            PORT: String(cliente.porta),
            CLIENTE_NOME: cliente.nome,
            PAINEL_SUPORTE: config.SUPORTE
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    child.on('error', (e) => console.error(`Erro ao bloquear ${cliente.nome} na porta ${cliente.porta}: ${e.message}`));
    child.on('exit', () => { bloqueadores.delete(cliente.id); });
    bloqueadores.set(cliente.id, child);
}

async function pararBloqueio(id, porta) {
    pararFilho(bloqueadores.get(id));
    bloqueadores.delete(id);
    if (porta) await matarPorta(porta);
}

// ---- Sistema de cadastro de aluno (uso próprio, 2 processos) ----

function gerarSenhaEscola(n = 16) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < n; i++) s += chars[crypto.randomInt(chars.length)];
    return s;
}

function pararFilhoEscola(serv) {
    if (!serv) return;
    for (const child of [serv.backend, serv.frontend]) {
        if (!child) continue;
        pararFilho(child);
    }
}

function aguardarSaude(url, tentativas = 40) {
    return new Promise(async (resolve) => {
        for (let i = 0; i < tentativas; i++) {
            try {
                const r = await fetch(url);
                if (r.ok) return resolve(true);
            } catch (e) { /* ainda subindo */ }
            await new Promise((res) => setTimeout(res, 500));
        }
        resolve(false);
    });
}

// Cria o admin da escola apenas na primeira execução (banco ainda sem usuários).
// Devolve a senha UMA vez; nunca é gravada em disco. Se já houver usuário, pula.
async function bootstrapAdminEscola() {
    const base = `http://127.0.0.1:${config.ESCOLA_PORTA_BACKEND}`;
    if (!(await aguardarSaude(`${base}/api/health`))) return null;
    const senha = gerarSenhaEscola();
    try {
        const resp = await fetch(`${base}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Admin', email: 'admin@escola.com', password: senha, role: 'admin' })
        });
        if (resp.ok) return senha;
    } catch (e) { /* ignora */ }
    return null;
}

async function iniciarEscola(cliente) {
    pararFilhoEscola(servicosEscola.get(cliente.id));
    servicosEscola.delete(cliente.id);
    await matarPorta(config.ESCOLA_PORTA_BACKEND);
    await matarPorta(config.ESCOLA_PORTA_FRONTEND);

    const logDir = path.join(config.DADOS, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `${cliente.id}.log`);
    const stream = fs.createWriteStream(logFile, { flags: 'a' });

    // Backend FastAPI (uvicorn). O .env da escola (SECRET_KEY etc.) é carregado pelo dotenv.
    const backend = spawn('python', ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(config.ESCOLA_PORTA_BACKEND)], {
        cwd: path.join(config.ESCOLA_DIR, 'backend'),
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    backend.on('error', (e) => console.error(`Erro ao iniciar backend da escola: ${e.message}`));
    backend.stdout.pipe(stream);
    backend.stderr.pipe(stream);

    // Frontend Vite via node direto (evita npx/.cmd e rastreia o PID real).
    const viteBin = path.join(config.ESCOLA_DIR, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js');
    const frontend = spawn(process.execPath, [viteBin, '--host', '127.0.0.1'], {
        cwd: path.join(config.ESCOLA_DIR, 'frontend'),
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    frontend.on('error', (e) => console.error(`Erro ao iniciar frontend da escola: ${e.message}`));
    frontend.stdout.pipe(stream);
    frontend.stderr.pipe(stream);

    backend.on('exit', () => {
        const s = servicosEscola.get(cliente.id);
        if (s && s.backend === backend) s.backend = null;
    });
    frontend.on('exit', () => {
        const s = servicosEscola.get(cliente.id);
        if (s && s.frontend === frontend) s.frontend = null;
    });
    servicosEscola.set(cliente.id, { backend, frontend });

    const adminSenha = await bootstrapAdminEscola();
    return { logFile, adminSenha };
}

async function pararEscola(id) {
    pararFilhoEscola(servicosEscola.get(id));
    servicosEscola.delete(id);
    await matarPorta(config.ESCOLA_PORTA_BACKEND);
    await matarPorta(config.ESCOLA_PORTA_FRONTEND);
}

function escolaRodando(id) {
    const s = servicosEscola.get(id);
    if (!s) return false;
    const vivo = (c) => c && c.exitCode === null && !c.killed;
    return Boolean(vivo(s.backend) && vivo(s.frontend));
}

function instanciaRodando(id) {
    const child = processos.get(id);
    return Boolean(child && child.exitCode === null && !child.killed);
}

function bloqueioAtivo(id) {
    const child = bloqueadores.get(id);
    return Boolean(child && child.exitCode === null && !child.killed);
}

// Ao iniciar o painel: religa instâncias ATIVAS e bloqueios SUSPENSOS que se perderam.
// Clientes SUSPENSOS: garante que nada do ERP fique na porta (mata órfãos) e sobe o bloqueio.
async function religar(clientes) {
    for (const c of clientes) {
        if (c.tipo === 'escola') {
            if (c.status === 'ATIVO' && !(await portaOcupada(config.ESCOLA_PORTA_FRONTEND))) {
                try { await iniciarEscola(c); console.log(`🎓 Escola religada: ${c.nome}`); } catch (e) { console.error(`Falha ao religar escola ${c.nome}: ${e.message}`); }
            }
            continue;
        }
        if (c.status === 'ATIVO') {
            if (!(await portaOcupada(c.porta))) {
                try { await iniciarInstancia(c); console.log(`▶ Instância religada: ${c.nome} (porta ${c.porta})`); } catch (e) { console.error(`Falha ao religar ${c.nome}: ${e.message}`); }
            } else {
                console.log(`ℹ Instância já ativa na porta ${c.porta}: ${c.nome}`);
            }
        } else if (c.status === 'SUSPENSO') {
            await matarPorta(c.porta);
            try { await iniciarBloqueio(c); console.log(`🔒 Bloqueio religado: ${c.nome} (porta ${c.porta})`); } catch (e) { console.error(`Falha ao bloquear ${c.nome}: ${e.message}`); }
        }
    }
}

function todosProcessos() {
    return new Map(processos);
}

module.exports = { criarBanco, dbPush, provisionar, iniciarInstancia, pararInstancia, instanciaRodando, iniciarBloqueio, pararBloqueio, bloqueioAtivo, portaOcupada, matarPorta, religar, todosProcessos, dbNome, iniciarEscola, pararEscola, escolaRodando };
