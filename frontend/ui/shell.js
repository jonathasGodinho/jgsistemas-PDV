// =========================================================================
// JG Sistemas — Shell compartilhado (sidebar + topbar + busca Ctrl+K)
// Uso: <body class="jg" data-pagina="produtos"> + <script src="/ui/shell.js"></script>
// Páginas sem shell (login, PDV): <body class="jg sem-shell" data-pagina="pdv">
// =========================================================================
(function () {
    'use strict';

    // Papéis do sistema
    const PAPEIS = {
        ADMIN: 'Administrador',
        MANAGER: 'Gerente',
        SUPERVISOR: 'Supervisor',
        SELLER: 'Vendedor',
        STOCKIST: 'Estoquista',
        FINANCIAL: 'Financeiro'
    };

    // Navegação. `modulo` = chave do módulo liberado pelo Painel do Administrador
    // (ausente = módulo essencial, sempre disponível). `papeis` = quem enxerga
    // (ausente = todos, exceto o operador de caixa, que só vê `seller: true`).
    const NAV = [
        { grupo: null, itens: [
            { id: 'inicio', nome: 'Início', icone: 'home', href: '/', seller: true }
        ] },
        { grupo: 'Vendas', itens: [
            { id: 'pdv', nome: 'PDV', icone: 'point_of_sale', href: '/pdv.html', kbd: 'F12', seller: true },
            { id: 'caixa', nome: 'Caixa', icone: 'account_balance_wallet', href: '/caixa.html', seller: true },
            { id: 'orcamentos', nome: 'Orçamentos', icone: 'request_quote', href: '/orcamentos.html', modulo: 'orcamentos', seller: true },
            { id: 'consultas', nome: 'Consulta de vendas', icone: 'receipt_long', href: '/consultas.html' },
            { id: 'trocas', nome: 'Trocas e devoluções', icone: 'sync_alt', href: '/trocas.html', modulo: 'trocas' },
            { id: 'crediario', nome: 'Crediário', icone: 'credit_score', href: '/vendas-fora-pdv.html', modulo: 'crediario', seller: true }
        ] },
        { grupo: 'Clientes', itens: [
            { id: 'clientes', nome: 'Clientes', icone: 'group', href: '/clientes.html' },
            { id: 'fidelidade', nome: 'Fidelidade', icone: 'loyalty', href: '/fidelidade.html', modulo: 'fidelidade' },
            { id: 'cobranca', nome: 'Cobrança', icone: 'notification_important', href: '/cobranca.html', modulo: 'cobranca' }
        ] },
        { grupo: 'Catálogo', itens: [
            { id: 'produtos', nome: 'Produtos', icone: 'inventory_2', href: '/produtos.html' },
            { id: 'categorias', nome: 'Categorias e marcas', icone: 'category', href: '/categorias.html' },
            { id: 'promocoes', nome: 'Promoções', icone: 'sell', href: '/promocoes.html', modulo: 'precos' },
            { id: 'tabelas-preco', nome: 'Tabelas de preço', icone: 'price_change', href: '/tabelas-preco.html', modulo: 'precos' }
        ] },
        { grupo: 'Estoque', itens: [
            { id: 'estoque', nome: 'Posição de estoque', icone: 'warehouse', href: '/estoque.html', modulo: 'estoque' },
            { id: 'inventario', nome: 'Inventário', icone: 'fact_check', href: '/inventario.html', modulo: 'inventario' },
            { id: 'compras', nome: 'Compras', icone: 'shopping_cart', href: '/compras.html', modulo: 'estoque' },
            { id: 'fornecedores', nome: 'Fornecedores', icone: 'local_shipping', href: '/fornecedores.html', modulo: 'estoque' }
        ] },
        { grupo: 'Financeiro', itens: [
            { id: 'financeiro-visao', nome: 'Visão geral', icone: 'monitoring', href: '/financeiro-visao.html', modulo: 'financeiro' },
            { id: 'financeiro', nome: 'Contas a pagar e receber', icone: 'payments', href: '/financeiro.html', modulo: 'financeiro' },
            { id: 'cartoes', nome: 'Cartões', icone: 'credit_card', href: '/recebiveis.html', modulo: 'cartoes',
              extras: ['/projecao-repasses.html', '/operadoras.html', '/conciliacao.html'] }
        ] },
        { grupo: 'Pessoas', itens: [
            { id: 'colaboradores', nome: 'Colaboradores', icone: 'badge', href: '/funcionarios.html', modulo: 'colaboradores' }
        ] },
        { grupo: null, itens: [
            { id: 'relatorios', nome: 'Relatórios', icone: 'analytics', href: '/relatorios.html', modulo: 'relatorios',
              extras: ['/relatorio-caixas.html'] }
        ] },
        { grupo: 'Administração', itens: [
            { id: 'auditoria', nome: 'Auditoria', icone: 'shield_person', href: '/auditoria.html', papeis: ['ADMIN', 'MANAGER'] },
            { id: 'configuracoes', nome: 'Configurações', icone: 'settings', href: '/configuracoes.html', papeis: ['ADMIN', 'MANAGER'],
              extras: ['/config-pagamento.html'] }
        ] }
    ];

    const SEGMENTOS = { VAREJO: 'Varejo', MODA: 'Varejo · Moda', SALAO: 'Salão de beleza' };

    // ---------------------------------------------------------------- utilidades
    function escH(v) {
        if (v === null || v === undefined) return '';
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function operador() {
        try { return JSON.parse(localStorage.getItem('jg_operador')) || null; } catch (e) { return null; }
    }

    function iniciais(nome) {
        const p = String(nome || '?').trim().split(/\s+/);
        return ((p[0] || '')[0] + ((p.length > 1 ? p[p.length - 1][0] : '') || '')).toUpperCase();
    }

    function caminhoAtual() {
        const p = location.pathname.replace(/\/+$/, '') || '/';
        return p === '/index.html' ? '/' : p;
    }

    function itemAtual() {
        const pagina = document.body.dataset.pagina;
        const caminho = caminhoAtual();
        for (const g of NAV) {
            for (const it of g.itens) {
                if (pagina && it.id === pagina) return { grupo: g.grupo, item: it };
            }
        }
        for (const g of NAV) {
            for (const it of g.itens) {
                if (it.href === caminho || (it.extras || []).includes(caminho)) return { grupo: g.grupo, item: it };
            }
        }
        return null;
    }

    // Módulos liberados para esta instalação (definidos no Painel do Administrador).
    let modulosLiberados = null; // null = ainda não carregado (mostra tudo)
    function moduloOk(chave) {
        if (!chave || !modulosLiberados) return true;
        return modulosLiberados.includes(chave);
    }

    function visivelPara(it, op) {
        if (!op) return false;
        if (op.papel === 'SELLER') return !!it.seller;
        if (it.papeis && !it.papeis.includes(op.papel)) return false;
        return true;
    }

    // ---------------------------------------------------------------- toasts
    function toast(msg, tipo) {
        let box = document.querySelector('.jg-toasts');
        if (!box) {
            box = document.createElement('div');
            box.className = 'jg-toasts';
            document.body.appendChild(box);
        }
        const icone = { sucesso: 'check_circle', erro: 'error', alerta: 'warning' }[tipo] || 'info';
        const el = document.createElement('div');
        el.className = 'jg-toast ' + (tipo || '');
        el.innerHTML = '<span class="ms">' + icone + '</span><div></div>';
        el.lastChild.textContent = msg;
        box.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; }, 3800);
        setTimeout(() => el.remove(), 4100);
    }
    window.jgToast = toast;

    // alert() nativo bloqueia a tela; no design system os avisos são toasts.
    // A mensagem fica guardada por alguns segundos para sobreviver a um redirecionamento.
    function tipoDaMensagem(msg) {
        const m = String(msg || '').toLowerCase();
        if (/erro|falha|inválid|invalid|não foi possível|negad|insuficiente|expirad|bloquead/.test(m)) return 'erro';
        if (/informe|selecione|preencha|atenção|aviso|obrigatóri|não há|nenhum/.test(m)) return 'alerta';
        if (/sucesso|salv|cadastrad|realizad|conclu|registrad|atualizad|exclu|aplicad|efetivad|lançad|enviad|autorizad|aberto|fechad/.test(m)) return 'sucesso';
        return '';
    }
    window.alert = function (msg) {
        const tipo = tipoDaMensagem(msg);
        try { sessionStorage.setItem('jg_toast_pendente', JSON.stringify({ msg: String(msg), tipo, t: Date.now() })); } catch (e) { /* ignore */ }
        setTimeout(() => { try { sessionStorage.removeItem('jg_toast_pendente'); } catch (e) { /* ignore */ } }, 1500);
        if (document.body) toast(String(msg), tipo);
        else document.addEventListener('DOMContentLoaded', () => toast(String(msg), tipo));
    };
    try {
        const p = JSON.parse(sessionStorage.getItem('jg_toast_pendente'));
        sessionStorage.removeItem('jg_toast_pendente');
        if (p && Date.now() - p.t < 6000) document.addEventListener('DOMContentLoaded', () => toast(p.msg, p.tipo));
    } catch (e) { /* ignore */ }

    // ---------------------------------------------------------------- montagem
    function montarSidebar(op, atual) {
        const recolhidos = (() => { try { return JSON.parse(localStorage.getItem('jg_nav_fechados')) || []; } catch (e) { return []; } })();
        let html = '<a class="jg-brand" href="/"><div class="jg-brand-logo">JG</div><div class="jg-brand-txt"><div class="jg-brand-nome">JG Sistemas</div><div class="jg-brand-sub" id="jg-brand-sub">Gestão comercial</div></div></a>';
        html += '<nav class="jg-nav" aria-label="Navegação principal">';
        for (const g of NAV) {
            const itens = g.itens.filter(it => visivelPara(it, op) && moduloOk(it.modulo));
            if (!itens.length) continue;
            const fechado = g.grupo && recolhidos.includes(g.grupo) && !(atual && atual.grupo === g.grupo);
            html += '<div class="jg-nav-grupo' + (fechado ? ' fechado' : '') + '" data-grupo="' + escH(g.grupo || '') + '">';
            if (g.grupo) html += '<button type="button" class="jg-nav-titulo"><span>' + escH(g.grupo) + '</span><span class="ms">expand_more</span></button>';
            html += '<div class="jg-nav-itens">';
            for (const it of itens) {
                const ativo = atual && atual.item.id === it.id;
                html += '<a href="' + it.href + '" class="' + (ativo ? 'ativo' : '') + '" title="' + escH(it.nome) + '"' +
                    (it.id === 'pdv' ? ' target="_blank" rel="noopener"' : '') + '>' +
                    '<span class="ms">' + it.icone + '</span><span>' + escH(it.nome) + '</span>' +
                    (it.kbd ? '<span class="kbd">' + it.kbd + '</span>' : '') + '</a>';
            }
            html += '</div></div>';
        }
        html += '</nav>';
        html += '<div class="jg-sidebar-rodape"><div class="jg-segmento"><span class="ms sm">storefront</span><span>Segmento:</span> <b id="jg-segmento">Varejo · Moda</b><i class="ponto"></i></div>' +
            '<button type="button" class="jg-recolher" id="jg-recolher"><span class="ms sm">keyboard_double_arrow_left</span><span>Recolher menu</span></button></div>';

        const aside = document.createElement('aside');
        aside.className = 'jg-sidebar';
        aside.innerHTML = html;
        aside.addEventListener('click', (e) => {
            const t = e.target.closest('.jg-nav-titulo');
            if (!t) return;
            const grupo = t.parentElement;
            grupo.classList.toggle('fechado');
            const fechados = [...aside.querySelectorAll('.jg-nav-grupo.fechado')].map(x => x.dataset.grupo);
            try { localStorage.setItem('jg_nav_fechados', JSON.stringify(fechados)); } catch (err) { /* ignore */ }
        });
        aside.querySelector('#jg-recolher').addEventListener('click', () => {
            document.body.classList.toggle('sidebar-recolhida');
            try { localStorage.setItem('jg_sidebar_recolhida', document.body.classList.contains('sidebar-recolhida') ? '1' : '0'); } catch (err) { /* ignore */ }
        });
        return aside;
    }

    function montarTopbar(op, atual) {
        const titulo = document.body.dataset.titulo || (atual ? atual.item.nome : document.title.split(' - ')[0]);
        const grupo = atual && atual.grupo ? atual.grupo : 'JG Sistemas';
        const header = document.createElement('header');
        header.className = 'jg-topbar';
        header.innerHTML =
            '<button type="button" class="jg-icon-btn jg-menu-btn" id="jg-menu-btn" aria-label="Abrir menu"><span class="ms">menu</span></button>' +
            '<div class="jg-breadcrumb"><span>' + escH(grupo) + '</span><span class="sep">/</span><b>' + escH(titulo) + '</b></div>' +
            '<div class="jg-busca"><span class="ms">search</span><input type="text" id="jg-busca" autocomplete="off" placeholder="Buscar módulo, produto ou cliente (Ctrl+K)"><span class="kbd">Ctrl K</span><div class="jg-busca-res" id="jg-busca-res"></div></div>' +
            '<div class="jg-topbar-dir">' +
                '<a class="jg-chip-caixa fechado" id="jg-chip-caixa" href="/caixa.html"><i class="ponto"></i><span>Caixa fechado</span></a>' +
                '<a class="btn btn-sucesso btn-sm" href="/pdv.html" target="_blank" rel="noopener" style="height:34px"><span class="ms">point_of_sale</span><span class="btn-pdv-txt">Abrir PDV</span></a>' +
                '<div style="position:relative"><button type="button" class="jg-icon-btn" id="jg-sino" aria-label="Avisos"><span class="ms">notifications</span><i class="badge-ponto hidden" id="jg-sino-ponto"></i></button>' +
                    '<div class="jg-menu jg-avisos" id="jg-avisos"><div class="jg-avisos-head">Avisos</div><div class="jg-avisos-lista" id="jg-avisos-lista"><div class="jg-aviso-item"><span class="ms">hourglass_empty</span><div>Carregando...</div></div></div></div></div>' +
                '<div style="position:relative"><button type="button" class="jg-user" id="jg-user">' +
                    '<div class="jg-avatar">' + escH(iniciais(op.nome || op.email)) + '</div>' +
                    '<div class="jg-user-txt"><div class="jg-user-nome">' + escH(op.nome || op.email) + '</div><div class="jg-user-papel">' + escH(PAPEIS[op.papel] || op.papel || '') + '</div></div>' +
                    '<span class="ms sm muted">expand_more</span></button>' +
                    '<div class="jg-menu" id="jg-user-menu">' +
                        '<a href="/caixa.html"><span class="ms">account_balance_wallet</span>Meu caixa</a>' +
                        (op.papel === 'ADMIN' || op.papel === 'MANAGER' ? '<a href="/configuracoes.html"><span class="ms">settings</span>Configurações</a>' : '') +
                        '<button type="button" class="perigo" id="jg-sair"><span class="ms">logout</span>Trocar operador / Sair</button>' +
                    '</div></div>' +
            '</div>';
        return header;
    }

    // ---------------------------------------------------------------- busca Ctrl+K
    function ligarBusca(op) {
        const input = document.getElementById('jg-busca');
        const res = document.getElementById('jg-busca-res');
        if (!input) return;
        let sel = 0;
        const todos = [];
        for (const g of NAV) for (const it of g.itens) {
            if (visivelPara(it, op) && moduloOk(it.modulo)) todos.push({ ...it, grupo: g.grupo });
        }
        const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

        function render() {
            const q = normalizar(input.value.trim());
            let lista = todos.filter(it => !q || normalizar(it.nome + ' ' + (it.grupo || '')).includes(q)).map(it => ({
                href: it.href, icone: it.icone, nome: it.nome, info: it.grupo || 'Módulo'
            }));
            if (q.length >= 2 && op.papel !== 'SELLER') {
                lista.push({ href: '/produtos.html?busca=' + encodeURIComponent(input.value.trim()), icone: 'inventory_2', nome: 'Buscar produto "' + input.value.trim() + '"', info: 'Produtos' });
                lista.push({ href: '/clientes.html?busca=' + encodeURIComponent(input.value.trim()), icone: 'person_search', nome: 'Buscar cliente "' + input.value.trim() + '"', info: 'Clientes' });
            }
            lista = lista.slice(0, 12);
            sel = Math.min(sel, Math.max(lista.length - 1, 0));
            res.innerHTML = lista.length
                ? lista.map((r, i) => '<a href="' + r.href + '" class="' + (i === sel ? 'sel' : '') + '"><span class="ms">' + r.icone + '</span>' + escH(r.nome) + '<small>' + escH(r.info) + '</small></a>').join('')
                : '<div class="vazio">Nada encontrado.</div>';
            res.classList.add('aberto');
        }
        input.addEventListener('focus', render);
        input.addEventListener('input', () => { sel = 0; render(); });
        input.addEventListener('keydown', (e) => {
            const links = res.querySelectorAll('a');
            if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, links.length - 1); render(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
            else if (e.key === 'Enter') { e.preventDefault(); if (links[sel]) location.href = links[sel].getAttribute('href'); }
            else if (e.key === 'Escape') { res.classList.remove('aberto'); input.blur(); }
        });
        document.addEventListener('click', (e) => { if (!e.target.closest('.jg-busca')) res.classList.remove('aberto'); });
    }

    // ---------------------------------------------------------------- dados ao vivo
    async function getJSON(url) {
        const r = await fetch(url, { credentials: 'same-origin' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }

    async function carregarCaixa() {
        const chip = document.getElementById('jg-chip-caixa');
        if (!chip) return;
        try {
            const c = await getJSON('/api/caixa/aberto');
            if (c && c.numero) {
                chip.className = 'jg-chip-caixa aberto';
                chip.querySelector('span').textContent = 'Caixa ' + String(c.numero).padStart(2, '0') + ' · Aberto';
            } else {
                chip.className = 'jg-chip-caixa fechado';
                chip.querySelector('span').textContent = 'Caixa fechado';
            }
        } catch (e) { /* mantém o estado padrão */ }
    }

    async function carregarAvisos(op) {
        const lista = document.getElementById('jg-avisos-lista');
        const ponto = document.getElementById('jg-sino-ponto');
        const avisos = [];
        try {
            const m = JSON.parse(localStorage.getItem('jg_aviso_mensalidade'));
            if (m && m.mensagem) avisos.push({ icone: 'payments', texto: m.mensagem, perigo: true });
        } catch (e) { /* ignore */ }
        if (op.papel !== 'SELLER') {
            try {
                const d = await getJSON('/api/dashboard');
                const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                if (d.contas && d.contas.receberVencidas > 0) avisos.push({ icone: 'event_busy', texto: 'Contas a receber vencidas: ' + fmt(d.contas.receberVencidas), perigo: true, href: '/financeiro.html' });
                if (d.contas && d.contas.pagarVencidas > 0) avisos.push({ icone: 'event_busy', texto: 'Contas a pagar vencidas: ' + fmt(d.contas.pagarVencidas), href: '/financeiro.html' });
                (d.estoqueBaixo || []).slice(0, 6).forEach(p => avisos.push({ icone: 'inventory', texto: 'Estoque baixo: ' + p.nome + ' (' + p.quantidade + ' un · mín. ' + p.minimo + ')', href: '/estoque.html' }));
            } catch (e) { /* sem permissão ou offline */ }
        }
        if (!lista) return;
        ponto.classList.toggle('hidden', !avisos.length);
        lista.innerHTML = avisos.length
            ? avisos.map(a => '<' + (a.href ? 'a href="' + a.href + '"' : 'div') + ' class="jg-aviso-item' + (a.perigo ? ' perigo' : '') + '" style="text-decoration:none;color:inherit"><span class="ms">' + a.icone + '</span><div>' + escH(a.texto) + '</div></' + (a.href ? 'a' : 'div') + '>').join('')
            : '<div class="jg-aviso-item"><span class="ms" style="color:var(--green)">check_circle</span><div>Nenhum aviso no momento.</div></div>';
    }

    async function carregarModulos(op, atual) {
        try {
            const m = await getJSON('/api/sistema/modulos');
            modulosLiberados = Array.isArray(m.liberados) ? m.liberados : null;
            window.jgModulos = m;
            const seg = document.getElementById('jg-segmento');
            if (seg && m.segmento) seg.textContent = SEGMENTOS[m.segmento] || m.segmento;
            const sub = document.getElementById('jg-brand-sub');
            if (sub && m.empresa) sub.textContent = m.empresa;
        } catch (e) { modulosLiberados = null; }
        if (!modulosLiberados) return;
        // Recria a sidebar sem os módulos bloqueados
        const antiga = document.querySelector('.jg-sidebar');
        if (antiga) antiga.replaceWith(montarSidebar(op, atual));
        // Página de um módulo bloqueado: mostra aviso no lugar do conteúdo
        if (atual && atual.item.modulo && !moduloOk(atual.item.modulo)) bloquearPagina(atual.item.nome);
        document.dispatchEvent(new CustomEvent('jg:modulos', { detail: m }));
    }

    function bloquearPagina(nome) {
        const main = document.querySelector('.jg-main');
        if (!main) return;
        main.innerHTML = '<div class="card" style="max-width:560px;margin:60px auto"><div class="estado-vazio"><span class="ms">lock</span>' +
            '<h2 style="font-size:18px;margin-bottom:6px">Módulo não liberado</h2><p>O módulo <b>' + escH(nome) + '</b> não faz parte do plano contratado. Fale com o suporte da JG Sistemas para liberar.</p>' +
            '<a class="btn btn-primario" href="/"><span class="ms">home</span>Voltar ao início</a></div></div>';
    }

    // ---------------------------------------------------------------- inicialização
    function iniciar() {
        const body = document.body;
        body.classList.add('jg');
        const op = operador();
        const semShell = body.classList.contains('sem-shell');
        if (!op && !body.hasAttribute('data-publico')) { location.href = '/login.html'; return; }
        if (semShell || !op) return;

        const atual = itemAtual();
        try { if (localStorage.getItem('jg_sidebar_recolhida') === '1') body.classList.add('sidebar-recolhida'); } catch (e) { /* ignore */ }

        // Conteúdo da página: usa o <main> existente ou embrulha tudo num novo
        let main = body.querySelector(':scope > main');
        if (!main) {
            main = document.createElement('main');
            [...body.childNodes].forEach(n => {
                if (n.nodeType === 1 && (n.tagName === 'SCRIPT' || n.classList.contains('modal-overlay'))) return;
                main.appendChild(n);
            });
            body.prepend(main);
        }
        main.classList.add('jg-main');

        body.prepend(montarTopbar(op, atual));
        body.prepend(montarSidebar(op, atual));

        // Eventos do topo
        const menuUser = document.getElementById('jg-user-menu');
        const avisos = document.getElementById('jg-avisos');
        document.getElementById('jg-user').addEventListener('click', (e) => { e.stopPropagation(); avisos.classList.remove('aberto'); menuUser.classList.toggle('aberto'); });
        document.getElementById('jg-sino').addEventListener('click', (e) => { e.stopPropagation(); menuUser.classList.remove('aberto'); avisos.classList.toggle('aberto'); });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#jg-user-menu')) menuUser.classList.remove('aberto');
            if (!e.target.closest('#jg-avisos')) avisos.classList.remove('aberto');
            if (body.classList.contains('sidebar-aberta') && !e.target.closest('.jg-sidebar') && !e.target.closest('#jg-menu-btn')) body.classList.remove('sidebar-aberta');
        });
        document.getElementById('jg-menu-btn').addEventListener('click', () => body.classList.toggle('sidebar-aberta'));
        document.getElementById('jg-sair').addEventListener('click', () => {
            fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
            localStorage.removeItem('jg_operador');
            location.href = '/login.html';
        });

        // Atalhos globais: Ctrl+K busca, F12 abre o PDV
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                const b = document.getElementById('jg-busca');
                if (b) { b.focus(); b.select(); }
            } else if (e.key === 'F12' && !document.querySelector('.modal-overlay.active, .modal-overlay.ativo, .modal-overlay.show')) {
                e.preventDefault();
                window.open('/pdv.html', '_blank', 'noopener');
            }
        });

        ligarBusca(op);
        carregarCaixa();
        carregarAvisos(op);
        carregarModulos(op, atual);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();

    // Preenche o endereço a partir do CEP. `prefixo` = prefixo dos ids dos campos
    // (ex.: 'f-' para f-cep, f-endereco, f-bairro, f-cidade, f-estado, f-numero).
    async function buscarCep(prefixo) {
        const campo = (n) => document.getElementById(prefixo + n);
        const cepEl = campo('cep');
        const cep = String(cepEl ? cepEl.value : '').replace(/\D/g, '');
        if (cep.length !== 8) { toast('Informe um CEP com 8 dígitos.', 'alerta'); return; }
        try {
            const d = await getJSON('/api/sistema/cep/' + cep);
            if (cepEl) cepEl.value = d.cep || cepEl.value;
            [['endereco', d.endereco], ['bairro', d.bairro], ['cidade', d.cidade], ['estado', d.estado]].forEach(([n, v]) => {
                const el = campo(n);
                if (el && v) el.value = v;
            });
            const comp = campo('complemento');
            if (comp && !comp.value && d.complemento) comp.value = d.complemento;
            const num = campo('numero');
            if (num) num.focus();
        } catch (e) {
            toast('CEP não encontrado. Preencha o endereço manualmente.', 'alerta');
        }
    }

    window.JG = { NAV, PAPEIS, operador, toast, iniciais, buscarCep, moduloOk: (k) => moduloOk(k) };
})();
