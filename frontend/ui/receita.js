// =========================================================================
// JG Sistemas — Receita de medicamento controlado/antimicrobiano (Farmácia Fase 2)
// Uso: const r = await JGReceita.abrir(produto, quantidade, { anteriores: [...] })
//   produto: { descricao, classeSngpc, listaPortaria344, tipoReceituario, qtdMaxReceita }
//   anteriores: [{ indice, rotulo, tipoReceituario }] — receitas já informadas nesta venda
// Resolve: { receita: <contrato C-02> } | { reutilizar: <indice> } | null (cancelado)
// Regras: Guia SNGPC v2.3 §4.2; decisões D-04, D-08, D-23, D-25 (docs/sprintx/features/farmacia-controlados)
// =========================================================================
(function () {
    'use strict';

    const TIPOS = {
        1: 'Receita de Controle Especial (2 vias)',
        2: 'Notificação de Receita B (azul)',
        3: 'Notificação de Receita Especial (branca)',
        4: 'Notificação de Receita A (amarela)',
        5: 'Receita de antimicrobiano (2 vias)'
    };
    const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI',
        'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
    const DOCUMENTOS = [[2, 'Carteira de identidade'], [1, 'Carteira de registro profissional'], [50, 'CTPS'],
        [13, 'Passaporte'], [11, 'Identidade do estrangeiro'], [7, 'Certificado de reservista'], [5, 'Certidão de nascimento'], [6, 'Certidão de casamento']];
    const ORGAOS = ['SSP', 'DIC', 'DPF', 'SESP', 'SES', 'PM', 'IFP', 'CRM', 'CRF', 'CRO', 'COREN', 'MEX', 'MM', 'MAER', 'OAB', 'MTE', 'SRF'];

    const conselhos = (classe, uso) => classe === 'ANTIMICROBIANO'
        ? ['CRM', 'CRO', 'CRF', 'CRMV', 'COREN', 'RMS']
        : (uso === 2 ? ['CRMV'] : ['CRM', 'CRO', 'CRF', 'RMS']);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const diasDesde = (iso) => {
        const [a, m, d] = iso.split('-').map(Number);
        const p = Date.UTC(a, m - 1, d);
        const h = new Date();
        return Math.round((Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()) - p) / 86400000);
    };
    const token = () => { try { return (JSON.parse(localStorage.getItem('jg_operador') || 'null') || {}).token || ''; } catch (e) { return ''; } };
    const opcoes = (lista, sel) => lista.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(t)}</option>`).join('');

    function montar() {
        let el = document.getElementById('modal-receita');
        if (el) return el;
        el = document.createElement('div');
        el.className = 'modal-overlay';
        el.id = 'modal-receita';
        el.innerHTML = '<div class="modal"><div class="modal-head"><span id="rc-titulo">Receita</span><span class="close" id="rc-fechar">&times;</span></div><div class="modal-body" id="rc-corpo"></div></div>';
        document.body.appendChild(el);
        return el;
    }

    function abrir(produto, quantidade, op) {
        op = op || {};
        const classe = produto.classeSngpc;
        const tipo = produto.tipoReceituario;
        const ehAntimicrobiano = classe === 'ANTIMICROBIANO';
        const max = produto.qtdMaxReceita || null;
        const acimaDoMax = Boolean(max && quantidade > max);
        const anteriores = (op.anteriores || []).filter((a) => a.tipoReceituario === tipo);
        const modal = montar();
        const corpo = modal.querySelector('#rc-corpo');
        modal.querySelector('#rc-titulo').innerText = `Receita — ${produto.descricao || ''}`;
        corpo.innerHTML = `
            <div class="alerta" style="margin-bottom:6px"><span class="ms">medication</span><div><b>${esc(TIPOS[tipo] || 'Receita')}</b>${produto.listaPortaria344 ? ' · Lista ' + esc(produto.listaPortaria344) : ''} · validade ${tipo === 5 ? 10 : 30} dias</div></div>
            ${anteriores.length ? `<label for="rc-reuso">Mesma receita de outro item</label>
                <select id="rc-reuso"><option value="">Nova receita</option>${anteriores.map((a) => `<option value="${a.indice}">${esc(a.rotulo)}</option>`).join('')}</select>` : ''}
            <div id="rc-nova">
                <div class="grid-3">
                    <div><label for="rc-numero">Número${tipo === 5 ? ' (opcional)' : ''}</label><input type="text" id="rc-numero" maxlength="20"></div>
                    <div><label for="rc-data">Data da prescrição</label><input type="date" id="rc-data" value="${hojeISO()}"></div>
                    <div><label for="rc-uso">Uso</label><select id="rc-uso"><option value="1">Humano</option><option value="2">Veterinário</option></select></div>
                </div>
                <div class="grid-4">
                    <div style="grid-column:span 2"><label for="rc-presc-nome">Prescritor</label><input type="text" id="rc-presc-nome" maxlength="80"></div>
                    <div><label for="rc-presc-conselho">Conselho</label><select id="rc-presc-conselho"></select></div>
                    <div><label for="rc-presc-numero">Nº registro</label><input type="text" id="rc-presc-numero" maxlength="20"></div>
                </div>
                <label for="rc-presc-uf">UF do conselho</label><select id="rc-presc-uf">${opcoes(UFS.map((u) => [u, u]), 'AM')}</select>
                <div id="rc-comprador" class="${ehAntimicrobiano ? 'hidden' : ''}">
                    <h4 style="margin:14px 0 2px">Comprador</h4>
                    <div class="grid-3">
                        <div><label for="rc-comp-tipo">Documento</label><select id="rc-comp-tipo">${opcoes(DOCUMENTOS, 2)}</select></div>
                        <div><label for="rc-comp-doc">Número do documento</label><input type="text" id="rc-comp-doc" maxlength="20"></div>
                        <div><label for="rc-comp-orgao">Órgão expedidor</label><input type="text" id="rc-comp-orgao" list="rc-orgaos" maxlength="10" value="SSP"><datalist id="rc-orgaos">${ORGAOS.map((o) => `<option value="${o}">`).join('')}</datalist></div>
                    </div>
                    <div class="grid-2">
                        <div><label for="rc-comp-nome">Nome do comprador</label><input type="text" id="rc-comp-nome" maxlength="80"></div>
                        <div><label for="rc-comp-uf">UF do documento</label><select id="rc-comp-uf">${opcoes(UFS.map((u) => [u, u]), 'AM')}</select></div>
                    </div>
                </div>
                <div id="rc-paciente" class="${ehAntimicrobiano ? '' : 'hidden'}">
                    <h4 style="margin:14px 0 2px">Paciente</h4>
                    <div class="grid-4">
                        <div style="grid-column:span 2"><label for="rc-pac-nome">Nome do paciente</label><input type="text" id="rc-pac-nome" maxlength="80"></div>
                        <div><label for="rc-pac-idade">Idade</label><input type="number" id="rc-pac-idade" min="0" max="150"></div>
                        <div><label for="rc-pac-unidade">Em</label><select id="rc-pac-unidade"><option value="1">Anos</option><option value="2">Meses</option></select></div>
                    </div>
                    <label for="rc-pac-sexo">Sexo</label><select id="rc-pac-sexo"><option value="">—</option><option value="1">Masculino</option><option value="2">Feminino</option></select>
                </div>
                ${acimaDoMax ? `<label class="check" style="margin-top:12px"><input type="checkbox" id="rc-confirma-qtd"> Confirmo a quantidade ${quantidade} acima do máximo de ${max} por receita (justificativa do prescritor)</label>` : ''}
            </div>
            <div class="modal-erro" id="rc-erro"></div>
            <button class="btn-primary" id="rc-ok">Confirmar receita</button>
            <button class="btn-primary cinza" id="rc-cancelar">Cancelar item</button>`;

        const $ = (id) => corpo.querySelector('#' + id);
        const preencherConselhos = () => {
            const atual = $('rc-presc-conselho').value;
            const lista = conselhos(classe, Number($('rc-uso').value));
            $('rc-presc-conselho').innerHTML = lista.map((c) => `<option${c === atual ? ' selected' : ''}>${c}</option>`).join('');
        };
        preencherConselhos();
        $('rc-uso').addEventListener('change', preencherConselhos);
        if ($('rc-reuso')) {
            $('rc-reuso').addEventListener('change', () => $('rc-nova').classList.toggle('hidden', Boolean($('rc-reuso').value)));
        }
        // D-23: pré-preenche o comprador pela última receita do mesmo documento
        $('rc-comp-doc').addEventListener('blur', async () => {
            const doc = $('rc-comp-doc').value.trim();
            if (!doc || $('rc-comp-nome').value.trim()) return;
            try {
                const r = await fetch(`/api/farmacia/receitas/comprador/${encodeURIComponent(doc)}`, { headers: { Authorization: 'Bearer ' + token() } });
                if (!r.ok) return;
                const c = await r.json();
                if (c.nome) $('rc-comp-nome').value = c.nome;
                if (c.orgaoExpedidor) $('rc-comp-orgao').value = c.orgaoExpedidor;
                if (c.uf) $('rc-comp-uf').value = c.uf;
                if (c.tipoDocumento) $('rc-comp-tipo').value = String(c.tipoDocumento);
            } catch (e) { /* pré-preenchimento é opcional */ }
        });

        return new Promise((resolve) => {
            const fechar = (valor) => { modal.classList.remove('active'); resolve(valor); };
            const erro = (msg) => { $('rc-erro').innerText = msg; $('rc-erro').style.display = 'block'; };
            modal.querySelector('#rc-fechar').onclick = () => fechar(null);
            $('rc-cancelar').onclick = () => fechar(null);
            $('rc-ok').onclick = () => {
                if ($('rc-reuso') && $('rc-reuso').value) return fechar({ reutilizar: Number($('rc-reuso').value) });
                const data = $('rc-data').value;
                if (!data) return erro('Informe a data da prescrição.');
                const passados = diasDesde(data);
                const validade = tipo === 5 ? 10 : 30;
                if (passados < 0 || passados > validade) return erro(`Receita vencida: a validade é de ${validade} dias a partir da prescrição.`);
                const numero = $('rc-numero').value.trim();
                if (tipo !== 5 && !numero) return erro('Informe o número da notificação/receita.');
                const prescritor = { nome: $('rc-presc-nome').value.trim(), conselho: $('rc-presc-conselho').value, numero: $('rc-presc-numero').value.trim(), uf: $('rc-presc-uf').value };
                if (!prescritor.nome || !prescritor.numero) return erro('Informe nome e número de registro do prescritor.');
                const receita = { numero: numero || null, dataPrescricao: data, uso: Number($('rc-uso').value), prescritor };
                if (ehAntimicrobiano) {
                    receita.paciente = { nome: $('rc-pac-nome').value.trim(), idade: Number($('rc-pac-idade').value), unidadeIdade: Number($('rc-pac-unidade').value), sexo: Number($('rc-pac-sexo').value) };
                    if (!receita.paciente.nome || $('rc-pac-idade').value === '' || !receita.paciente.sexo) return erro('Informe nome, idade e sexo do paciente.');
                } else {
                    receita.comprador = { nome: $('rc-comp-nome').value.trim(), tipoDocumento: Number($('rc-comp-tipo').value), documento: $('rc-comp-doc').value.trim(), orgaoExpedidor: $('rc-comp-orgao').value.trim().toUpperCase(), uf: $('rc-comp-uf').value };
                    if (!receita.comprador.nome || !receita.comprador.documento || !receita.comprador.orgaoExpedidor) return erro('Informe nome, documento e órgão expedidor do comprador.');
                }
                if (acimaDoMax) {
                    if (!$('rc-confirma-qtd').checked) return erro(`Quantidade acima do máximo de ${max} por receita: confirme para continuar.`);
                    receita.quantidadeConfirmada = true;
                }
                receita.tipoReceituario = tipo;
                fechar({ receita });
            };
            modal.classList.add('active');
            setTimeout(() => ($('rc-reuso') || $('rc-numero')).focus(), 50);
        });
    }

    window.JGReceita = { abrir, TIPOS };
})();
