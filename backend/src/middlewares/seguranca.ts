// Headers de segurança aplicados em todas as respostas.
export const headersSeguranca = (_req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    // Content-Security-Policy: defesa em profundidade. As páginas usam muito
    // script inline, então 'unsafe-inline' é mantido, mas bloqueamos objetos,
    // scripts externos, iframes, envio de formulários para outras origens e o
    // uso do token de sessão em chamadas de outras origens (connect-src 'self').
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https://api.qrserver.com",
        "font-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'"
    ].join('; '));
    // HSTS somente quando o tráfego chega via HTTPS (atrás do proxy/reverse).
    const viaHttps = _req.secure || String(_req.headers['x-forwarded-proto'] || '').includes('https');
    if (viaHttps) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
};

// User-agents de crawlers de IA/LLM e de scrapers/exploit agressivos.
// Obs.: é defesa em profundidade (bloqueio por User-Agent é facilmente contornado);
// a proteção real continua sendo autenticação + rate limit + validação de entrada.
const BOTS_IA = new RegExp(
    [
        'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'OpenAI-ImageBot', 'gpt-',
        'ClaudeBot', 'anthropic-ai', 'Claude-Web', 'PerplexityBot', 'Perplexity-User',
        'CCBot', 'Common Crawl', 'Google-Extended', 'GoogleGeminiAI', 'Google-CloudVertexBot',
        'Bytespider', 'Amazonbot', 'Applebot-Extended', 'FacebookBot', 'Meta-ExternalAgent', 'Meta-Exporter',
        'cohere-ai', 'DataForSeoBot', 'PetalBot', 'Diffbot', 'ImagesiftBot', 'youBot', 'omgili',
        'AI2Bot', 'AI2Bot-Dolma', 'Scrapy', 'python-urllib', 'Python-requests', 'Go-http-client',
        'Wget', 'libwww-perl', 'HeadlessChrome', 'PhantomJS', 'Selenium', 'sqlmap', 'nmap',
        'Nikto', 'Zmeu', 'masscan', 'zgrab', 'Zeus', 'python-httpx'
    ].join('|'),
    'i'
);

export const bloquearBotsIA = (req: any, res: any, next: any) => {
    const ua = String(req.headers['user-agent'] || '');
    if (ua && BOTS_IA.test(ua)) {
        return res.status(403).send('Acesso negado.');
    }
    next();
};

// Assinaturas de injeção (SQLi + XSS). Conservadoras para não quebrar dados
// legítimos do negócio (ex.: nomes com apóstrofo). Apostrofo sozinho é permitido;
// só padrões claros de ataque são rejeitados.
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

// Campos cujo conteúdo é binário/base64/texto técnico — não aplicar a varredura.
const CAMPOS_IGNORADOS = /senha|password|novaSenha|senhaAtual|token|imagem|foto|base64|arquivo|assinatura|xml|pdf/i;

const escanear = (valor: any, chave: string): boolean => {
    if (typeof valor === 'string') {
        if (CAMPOS_IGNORADOS.test(chave)) return false;
        return PADROES_INJECAO.some(p => p.test(valor));
    }
    if (Array.isArray(valor)) return valor.some(v => escanear(v, chave));
    if (valor && typeof valor === 'object') {
        return Object.keys(valor).some(k => escanear(valor[k], k));
    }
    return false;
};

// Bloqueia payloads com assinaturas de injeção de código (SQLi/XSS) antes de
// chegarem às rotas. Aplica-se a query, parâmetros e corpo JSON.
export const protegerInjecao = (req: any, res: any, next: any) => {
    for (const parte of [req.query, req.body, req.params]) {
        if (parte && escanear(parte, '')) {
            return res.status(400).json({ erro: 'Requisição rejeitada: conteúdo suspeito detectado.' });
        }
    }
    next();
};
