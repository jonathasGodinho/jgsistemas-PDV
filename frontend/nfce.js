// ============================================================================
// Rodapé fiscal NFC-e (SEFAZ-AM) para o cupom — dependências: qrcode.js
// Renderiza o QR Code do cupom (URL de infNFeSupl/qrCode) e os dados da NFC-e.
// ============================================================================

function nfceQrSvg(texto, celula) {
    if (typeof qrcode !== 'function' || !texto) return '';
    try {
        const qr = qrcode(0, 'M');
        qr.addData(String(texto));
        qr.make();
        const n = qr.getModuleCount();
        const c = Math.max(2, Number(celula) || 4);
        let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2} ${n + 2}" style="width:${(n + 2) * c}px;height:${(n + 2) * c}px;image-rendering:pixelated;">`;
        s += `<rect width="100%" height="100%" fill="#ffffff"/>`;
        for (let r = 0; r < n; r++) {
            for (let col = 0; col < n; col++) {
                if (qr.isDark(r, col)) s += `<rect x="${col + 1}" y="${r + 1}" width="1" height="1" fill="#000000"/>`;
            }
        }
        return s + '</svg>';
    } catch (e) {
        return '';
    }
}

function nfceChaveFormatada(chave) {
    const d = String(chave || '').replace(/\D/g, '');
    if (d.length !== 44) return String(chave || '');
    return d.match(/.{1,4}/g).join(' ');
}

function nfceEstaAutorizada(nfe) {
    return !!nfe && nfe.status === 'AUTORIZADA';
}

function nfceDataAutorizacao(nfe) {
    if (!nfe || !nfe.emitidoEm) return '';
    try { return new Date(nfe.emitidoEm).toLocaleString('pt-BR'); } catch (e) { return ''; }
}

// URL de consulta pela chave (mesma base do QR, padrão SEFAZ)
function nfceUrlConsulta(nfe) {
    const chave = String(nfe && nfe.chave || '').replace(/\D/g, '');
    if (chave.length !== 44) return '';
    const base = (nfe.qrCode || '').split('?')[0];
    return base ? `${base}?chNFe=${chave}` : '';
}

// HTML para o modal/cupom na tela
function nfceFooterHtml(nfe) {
    if (!nfceEstaAutorizada(nfe)) return '';
    const url = nfe.qrCode || '';
    const consulta = nfceUrlConsulta(nfe);
    const dt = nfceDataAutorizacao(nfe);
    return `
        <hr>
        <div class="c-nome" style="text-align:center;">DADOS DA NFC-e</div>
        ${url ? `<div style="text-align:center;margin:6px 0;">${nfceQrSvg(url, 4)}</div>` : ''}
        ${url ? `<div style="font-size:10px;word-break:break-all;">${url}</div>` : ''}
        <div class="c-item"><span>NFC-e</span><span>Nº ${nfe.numero || ''} · Série ${nfe.serie || ''}</span></div>
        <div style="font-size:10px;">Chave de acesso: ${nfceChaveFormatada(nfe.chave)}</div>
        <div style="font-size:10px;">Protocolo: ${nfe.protocolo || ''}${dt ? ` · Autorizada em ${dt}` : ''}</div>
        ${consulta ? `<div style="font-size:10px;word-break:break-all;">Consulte em: ${consulta}</div>` : ''}`;
}

// Texto para a impressão térmica (com o QR impresso como imagem e URL em texto)
function nfceFooterLinhas(nfe) {
    if (!nfceEstaAutorizada(nfe)) return [];
    const url = nfe.qrCode || '';
    const consulta = nfceUrlConsulta(nfe);
    const dt = nfceDataAutorizacao(nfe);
    return [
        nfceSep(),
        nfceCentro('DADOS DA NFC-e'),
        `NFC-e Nº ${nfe.numero || ''} SERIE ${nfe.serie || ''}`.trim(),
        dt ? `AUTORIZADA EM: ${dt}` : null,
        `PROTOCOLO: ${nfe.protocolo || ''}`,
        nfceSep(),
        'CONSULTE PELA CHAVE DE ACESSO EM:',
        nfceQuebrar(consulta || url),
        url ? `QR: ${url}` : null,
        nfceSep()
    ].filter(l => l !== null && l !== '');
}

// HTML do bloco de impressão (texto + QR como imagem centralizada)
function nfceFooterPrintHtml(nfe) {
    const linhas = nfceFooterLinhas(nfe);
    if (!linhas.length) return '';
    const qr = nfe && nfe.qrCode ? `<div style="text-align:center;margin:8px 0 0;">${nfceQrSvg(nfe.qrCode, 4)}</div>` : '';
    return `<pre style="font-family:'Courier New',monospace; font-size:11px; margin:0; line-height:1.25;">${linhas.join('\n')}</pre>${qr}`;
}

// Helpers de texto locais (para o rodapé não depender das funções de cada página)
const NFCE_LARGURA = 42;
function nfceSep() { return '-'.repeat(NFCE_LARGURA); }
function nfceCentro(t) {
    t = String(t);
    if (t.length >= NFCE_LARGURA) return t;
    return ' '.repeat(Math.floor((NFCE_LARGURA - t.length) / 2)) + t;
}
function nfceQuebrar(t) {
    t = String(t);
    if (t.length <= NFCE_LARGURA) return t;
    const linhas = [];
    for (let i = 0; i < t.length; i += NFCE_LARGURA) linhas.push(t.slice(i, i + NFCE_LARGURA));
    return linhas.join('\n');
}
