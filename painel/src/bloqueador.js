// Servidor de bloqueio: responde na porta do cliente suspenso com página de aviso
const http = require('http');

const PORT = Number(process.env.PORT) || 3000;
const NOME = process.env.CLIENTE_NOME || 'Cliente';
const SUPORTE = process.env.PAINEL_SUPORTE || '(62) 98219-9003';

const PAGINA = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Acesso bloqueado - JG Sistemas</title>
    <meta name="robots" content="noindex, nofollow">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; }
        body { background-color: #f0f2f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .cartao { background: white; border: 1px solid #ccd1d9; border-radius: 8px; max-width: 460px; width: 100%; padding: 32px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,.08); }
        .icone { width: 64px; height: 64px; border-radius: 50%; background: #f8d7da; color: #b02a37; font-size: 34px; font-weight: bold; display: flex; align-items: center; justify-content: center; margin: 0 auto 18px; }
        h1 { color: #0b2545; font-size: 20px; margin-bottom: 10px; }
        p { color: #555; font-size: 14px; line-height: 1.5; margin-bottom: 6px; }
        .suporte { margin-top: 18px; padding-top: 16px; border-top: 1px solid #e6e9ed; font-size: 13px; color: #656d78; }
        .suporte strong { color: #134074; }
        .cliente { font-size: 12px; color: #8b95a1; margin-top: 14px; }
    </style>
</head>
<body>
    <div class="cartao">
        <div class="icone">!</div>
        <h1>Acesso bloqueado</h1>
        <p>O acesso ao sistema <strong>${NOME}</strong> está bloqueado.</p>
        <p>Entre em contato com o suporte para regularizar sua situação e reativar o serviço.</p>
        <div class="suporte">Suporte JG Sistemas: <strong>${SUPORTE}</strong></div>
        <div class="cliente">JG Sistemas &copy; ${new Date().getFullYear()}</div>
    </div>
</body>
</html>`;

const server = http.createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'self'; frame-ancestors 'none'");
    if (req.url && req.url.startsWith('/api/')) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ erro: 'Acesso bloqueado. Entre em contato com o suporte.' }));
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGINA);
});

server.listen(PORT, () => {
    console.log(`🔒 Cliente ${NOME} bloqueado na porta ${PORT}`);
});
