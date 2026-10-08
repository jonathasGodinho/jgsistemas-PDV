// Planos comerciais e módulos liberados por cliente.
// O catálogo de módulos vem do ERP (backend/modulos.json). Para cada cliente o painel
// grava dados/modulos/<id>.json, que a instância lê via JG_MODULOS_ARQUIVO (sem reiniciar).
const fs = require('fs');
const path = require('path');
const config = require('./config');

const ARQUIVO_PLANOS = path.join(config.DADOS, 'planos.json');
const PASTA_MODULOS = path.join(config.DADOS, 'modulos');

function catalogo() {
    const arq = path.join(config.BACKEND, 'modulos.json');
    return JSON.parse(fs.readFileSync(arq, 'utf8')).modulos;
}

function chavesValidas() {
    return new Set(catalogo().map((m) => m.chave));
}

// Planos de fábrica (usados na primeira execução)
const PLANOS_PADRAO = [
    {
        id: 'basico', nome: 'Básico', valor: 99.9, usuarios: 2, caixas: 1,
        descricao: 'PDV, caixa, clientes, produtos e NFC-e.',
        modulos: ['orcamentos', 'nfce', 'estoque', 'relatorios']
    },
    {
        id: 'profissional', nome: 'Profissional', valor: 199.9, usuarios: 5, caixas: 2, destaque: true,
        descricao: 'Tudo do Básico + crediário, fidelidade, promoções e financeiro.',
        modulos: ['orcamentos', 'nfce', 'estoque', 'relatorios', 'trocas', 'crediario', 'cobranca', 'fidelidade', 'precos', 'financeiro', 'colaboradores']
    },
    {
        id: 'completo', nome: 'Completo', valor: 349.9, usuarios: 0, caixas: 0,
        descricao: 'Todos os módulos disponíveis, usuários e caixas ilimitados.',
        modulos: ['orcamentos', 'nfce', 'estoque', 'relatorios', 'trocas', 'crediario', 'cobranca', 'fidelidade', 'precos', 'financeiro', 'colaboradores', 'inventario', 'cartoes']
    }
];

// Preço sugerido de cada módulo vendido como adicional (R$/mês)
const ADICIONAL_PADRAO = 29.9;

function lerPlanos() {
    try {
        const dados = JSON.parse(fs.readFileSync(ARQUIVO_PLANOS, 'utf8'));
        if (Array.isArray(dados.planos)) return dados;
    } catch (e) { /* primeira execução */ }
    return { planos: PLANOS_PADRAO, adicionais: {} };
}

function salvarPlanos(dados) {
    fs.mkdirSync(config.DADOS, { recursive: true });
    const validas = chavesValidas();
    const planos = (dados.planos || []).map((p) => ({
        id: String(p.id || '').trim() || slug(p.nome),
        nome: String(p.nome || '').trim() || 'Plano',
        valor: Math.max(0, Number(p.valor) || 0),
        usuarios: Math.max(0, Math.round(Number(p.usuarios) || 0)),
        caixas: Math.max(0, Math.round(Number(p.caixas) || 0)),
        descricao: String(p.descricao || '').slice(0, 200),
        destaque: !!p.destaque,
        modulos: [...new Set((p.modulos || []).filter((m) => validas.has(m)))]
    }));
    const adicionais = {};
    for (const [k, v] of Object.entries(dados.adicionais || {})) {
        if (validas.has(k)) adicionais[k] = Math.max(0, Number(v) || 0);
    }
    const final = { planos, adicionais };
    fs.writeFileSync(ARQUIVO_PLANOS, JSON.stringify(final, null, 2), 'utf8');
    return final;
}

function slug(s) {
    return String(s || 'plano').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plano';
}

function precoAdicional(chave, dados = lerPlanos()) {
    const v = dados.adicionais && dados.adicionais[chave];
    return v === undefined ? ADICIONAL_PADRAO : Number(v);
}

// Módulos efetivos de um cliente. Cliente sem configuração (cadastros antigos) = tudo
// que não é "futuro", para não tirar nada de quem já usa.
function modulosDoCliente(cliente) {
    if (Array.isArray(cliente.modulos)) return cliente.modulos;
    return catalogo().filter((m) => !m.futuro).map((m) => m.chave);
}

function resumoCobranca(cliente) {
    const dados = lerPlanos();
    const plano = dados.planos.find((p) => p.id === cliente.planoId) || null;
    const incluidos = new Set(plano ? plano.modulos : []);
    const extras = modulosDoCliente(cliente).filter((m) => !incluidos.has(m));
    const valorExtras = extras.reduce((s, m) => s + precoAdicional(m, dados), 0);
    return {
        plano,
        extras,
        valorPlano: plano ? plano.valor : 0,
        valorExtras: Number(valorExtras.toFixed(2)),
        total: Number(((plano ? plano.valor : 0) + valorExtras).toFixed(2))
    };
}

function arquivoDoCliente(cliente) {
    return path.join(PASTA_MODULOS, `${cliente.id}.json`);
}

// Grava o arquivo lido pela instância do cliente. Escrita atômica (tmp + rename).
function gravarLiberacao(cliente) {
    fs.mkdirSync(PASTA_MODULOS, { recursive: true });
    const destino = arquivoDoCliente(cliente);
    const tmp = destino + '.tmp';
    const plano = lerPlanos().planos.find((p) => p.id === cliente.planoId);
    const conteudo = {
        cliente: cliente.fantasia || cliente.nome,
        plano: plano ? plano.nome : null,
        segmento: cliente.segmento || 'MODA',
        modulos: modulosDoCliente(cliente),
        limites: {
            usuarios: Number(cliente.limiteUsuarios ?? (plano ? plano.usuarios : 0)) || 0,
            caixas: Number(cliente.limiteCaixas ?? (plano ? plano.caixas : 0)) || 0
        },
        atualizadoEm: new Date().toISOString()
    };
    fs.writeFileSync(tmp, JSON.stringify(conteudo, null, 2), 'utf8');
    fs.renameSync(tmp, destino);
    return destino;
}

module.exports = {
    catalogo, chavesValidas, lerPlanos, salvarPlanos, precoAdicional, modulosDoCliente,
    resumoCobranca, arquivoDoCliente, gravarLiberacao, ADICIONAL_PADRAO
};
