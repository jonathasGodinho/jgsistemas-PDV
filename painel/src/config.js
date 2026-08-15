// Configuração central do Painel de Gestão
const path = require('path');
const os = require('os');

const RAIZ = path.resolve(__dirname, '..', '..'); // pasta JG Sistemas
const BACKEND = path.join(RAIZ, 'backend');
const DADOS = path.join(RAIZ, 'dados');
const FRONTEND = path.join(__dirname, '..', 'public');
const ARQUIVO_CLIENTES = path.join(DADOS, 'clientes.json');
const ARQUIVO_SENHA = path.join(DADOS, 'painel.senha');

// Sistema de cadastro de aluno (uso próprio) — 2 processos: FastAPI (uvicorn) + Vite.
const ESCOLA_DIR = process.env.ESCOLA_DIR || 'C:\\Users\\jonat\\OneDrive\\Desktop\\sistema de cadastro aluno';

// Configurações de ambiente (override via env, defaults locais)
const config = {
    PORTA_PAINEL: Number(process.env.PAINEL_PORT) || 3100,
    PORTA_INICIAL_CLIENTES: Number(process.env.PORTA_INICIAL) || 3001,
    // Senha inicial de instalação nova: env PAINEL_SENHA ou aleatória (impressa no primeiro boot).
    // Nunca use a senha padrão de fábrica fixa.
    SENHA_PADRAO: process.env.PAINEL_SENHA || gerarSenhaForte(),
    SUPORTE: process.env.PAINEL_SUPORTE || '(62) 98219-9003',
    // Janela de tolerância da mensalidade: após o vencimento o cliente ainda acessa
    // (com aviso no login) por este número de horas; depois o painel suspende sozinho.
    JANELA_GRACE_HORAS: Number(process.env.JANELA_GRACE_HORAS) || 72,

    // PostgreSQL (mesmo servidor local)
    PG_HOST: process.env.PG_HOST || 'localhost',
    PG_PORT: Number(process.env.PG_PORT) || 5432,
    PG_USER: process.env.PG_USER || 'jgadmin',
    PG_PASSWORD: process.env.PG_PASSWORD || '',
    // Binário do createdb (fallback: procura na instalação do PostgreSQL)
    CREATEDB: process.env.PG_CREATEDB || (() => {
        for (const ver of ['17', '16', '15']) {
            const p = `C:\\Program Files\\PostgreSQL\\${ver}\\bin\\createdb.exe`;
            if (require('fs').existsSync(p)) return p;
        }
        return 'createdb';
    })(),

    RAIZ, BACKEND, DADOS, FRONTEND, ARQUIVO_CLIENTES, ARQUIVO_SENHA,
    ESCOLA_DIR,
    // Portas fixas do sistema da escola (backend FastAPI + frontend Vite).
    ESCOLA_PORTA_BACKEND: Number(process.env.ESCOLA_PORTA_BACKEND) || 8000,
    ESCOLA_PORTA_FRONTEND: Number(process.env.ESCOLA_PORTA_FRONTEND) || 5174,

    // Comando para subir uma instância do ERP: node -r ts-node/register src/server.ts
    instanciaCmd(banco, porta, cliente = null) {
        const env = {
            ...process.env,
            DATABASE_URL: this.urlBanco(banco),
            PORT: String(porta),
            TS_NODE_TRANSPILE_ONLY: '1'
        };
        if (cliente && cliente.vencimento) {
            env.MENSALIDADE_VENCIMENTO = String(cliente.vencimento).slice(0, 10);
            env.MENSALIDADE_JANELA_HORAS = String(this.JANELA_GRACE_HORAS);
        }
        return { cmd: process.execPath, args: ['-r', 'ts-node/register', 'src/server.ts'], env, cwd: this.BACKEND };
    },

    urlBanco(nome) {
        return `postgresql://${this.PG_USER}:${this.PG_PASSWORD}@${this.PG_HOST}:${this.PG_PORT}/${nome}?schema=public`;
    }
};

// C1: a senha do PostgreSQL vem EXCLUSIVAMENTE da variável de ambiente PG_PASSWORD.
// Sem ela o painel não deve subir (falha rápida e clara, sem ecoar segredo).
if (!process.env.PG_PASSWORD || !String(process.env.PG_PASSWORD).trim()) {
    throw new Error('PG_PASSWORD nao definida no ambiente. Defina a variavel de ambiente PG_PASSWORD antes de iniciar o painel.');
}

function gerarSenhaForte(n = 16) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = require('crypto').randomBytes(n);
    let senha = '';
    for (let i = 0; i < n; i++) senha += chars[bytes[i] % chars.length];
    return senha;
}

module.exports = config;
