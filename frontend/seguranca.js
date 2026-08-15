// Helpers de segurança do frontend.
// Use esc() (escapeHtml) em todo dado que venha do banco/API antes de montar innerHTML,
// para evitar injeção de HTML/script (XSS).
function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
