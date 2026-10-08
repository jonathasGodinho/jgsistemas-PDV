// Criptografia simétrica (AES-256-GCM) para segredos guardados no banco, como o
// certificado digital A1 e a senha dele. A chave fica só no servidor, na variável
// JG_CHAVE_CRIPTO (64 caracteres hex ou qualquer texto longo, derivado por SHA-256).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function chave(): Buffer {
    const bruta = process.env.JG_CHAVE_CRIPTO ?? '';
    if (!bruta) {
        throw new Error('JG_CHAVE_CRIPTO não configurada no servidor: não é possível guardar segredos com segurança.');
    }
    return /^[0-9a-f]{64}$/i.test(bruta) ? Buffer.from(bruta, 'hex') : createHash('sha256').update(bruta).digest();
}

export function criptoDisponivel(): boolean {
    return !!process.env.JG_CHAVE_CRIPTO;
}

// Retorna "v1:<iv>:<tag>:<dados>" em base64
export function cifrar(texto: Buffer | string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', chave(), iv);
    const dados = Buffer.concat([c.update(typeof texto === 'string' ? Buffer.from(texto, 'utf8') : texto), c.final()]);
    return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), dados.toString('base64')].join(':');
}

export function decifrar(pacote: string): Buffer {
    const [versao, iv, tag, dados] = String(pacote).split(':');
    if (versao !== 'v1' || !iv || !tag || !dados) throw new Error('Segredo em formato inválido.');
    const d = createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]);
}
