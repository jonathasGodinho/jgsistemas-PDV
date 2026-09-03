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

// ---- Campos numéricos: sem setinhas ↑/↓ e sem "0 na frente" ao digitar ----

// Esconde as setinhas de incremento/decremento em todos os inputs numéricos.
(function esconderSpinNumbers() {
    const style = document.createElement('style');
    style.textContent = [
        'input[type="number"]::-webkit-inner-spin-button,',
        'input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }',
        'input[type="number"] { -moz-appearance: textfield; appearance: textfield; }'
    ].join('\n');
    document.head.appendChild(style);
})();

// Ao focar um campo numérico/decimal, seleciona todo o conteúdo. Assim qualquer
// valor já presente (ex.: "0,00") é substituído ao digitar, em vez de ficar na frente.
(function selecionarAoFocar() {
    function ehNumerico(input) {
        return input && input.tagName === 'INPUT'
            && !input.readOnly && !input.disabled
            && (input.type === 'number' || (input.type === 'text' && input.getAttribute('inputmode') === 'decimal'));
    }
    document.addEventListener('focusin', (e) => {
        const input = e.target;
        if (!ehNumerico(input)) return;
        setTimeout(() => {
            try { input.select(); } catch (_) { /* ignore */ }
        }, 0);
    });
})();
