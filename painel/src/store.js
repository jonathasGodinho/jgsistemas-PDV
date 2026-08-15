// Armazenamento dos clientes em JSON (dados/clientes.json)
const fs = require('fs');
const path = require('path');
const { ARQUIVO_CLIENTES, DADOS } = require('./config');

function garantirArquivos() {
    if (!fs.existsSync(DADOS)) fs.mkdirSync(DADOS, { recursive: true });
    if (!fs.existsSync(ARQUIVO_CLIENTES)) fs.writeFileSync(ARQUIVO_CLIENTES, '[]', 'utf8');
}

function lerClientes() {
    garantirArquivos();
    try {
        return JSON.parse(fs.readFileSync(ARQUIVO_CLIENTES, 'utf8'));
    } catch (e) {
        return [];
    }
}

function salvarClientes(lista) {
    garantirArquivos();
    fs.writeFileSync(ARQUIVO_CLIENTES, JSON.stringify(lista, null, 2), 'utf8');
}

function porId(id) {
    return lerClientes().find((c) => c.id === id);
}

function porBanco(banco) {
    return lerClientes().find((c) => c.banco === banco);
}

module.exports = { garantirArquivos, lerClientes, salvarClientes, porId, porBanco };
