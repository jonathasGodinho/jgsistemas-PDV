// Rate limit em memória (por IP) — proteção contra força bruta e abuso da API.
// Obs.: funciona por processo; em multi-instância, considere um store compartilhado.

interface LimiterOpcoes {
    janelaMs: number;
    max: number;
    mensagem: string;
    chave?: string;
}

const janelas = new Map<string, number[]>();
let limpezaIniciada = false;

const iniciarLimpeza = () => {
    if (limpezaIniciada) return;
    limpezaIniciada = true;
    setInterval(() => {
        const agora = Date.now();
        for (const [chave, ts] of janelas) {
            const vivos = ts.filter(t => agora - t < 60_000);
            if (vivos.length === 0) janelas.delete(chave);
            else janelas.set(chave, vivos);
        }
    }, 60_000).unref();
};

export const criarLimiter = (opcoes: LimiterOpcoes) => (req: any, res: any, next: any) => {
    iniciarLimpeza();
    const ip = req.ip || req.socket?.remoteAddress || '0.0.0.0';
    const chave = `${opcoes.chave || 'api'}:${ip}`;
    const agora = Date.now();

    let timestamps = janelas.get(chave) ?? [];
    timestamps = timestamps.filter(t => agora - t < opcoes.janelaMs);

    if (timestamps.length >= opcoes.max) {
        res.set('Retry-After', String(Math.ceil(opcoes.janelaMs / 1000)));
        return res.status(429).json({ erro: opcoes.mensagem });
    }

    timestamps.push(agora);
    janelas.set(chave, timestamps);
    next();
};
