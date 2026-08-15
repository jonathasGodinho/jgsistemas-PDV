# Registro da Sessão — Impressão A4 de Venda a Prazo (Vendas Fora do PDV)

Data: 08/08/2026
Ambiente: Windows, backend em `backend/` (porta 3001), frontend em `frontend/`.

## Contexto

O sistema "JG Sistemas" tem uma página de **Venda Fora do PDV** (`frontend/vendas-fora-pdv.html`)
que registra vendas a prazo/crediário. A impressão era térmica (cupom 42 colunas) e foi
substituída por uma impressão **A4** com contrato em 2 vias + carnê de cobrança.

## O que foi implementado

Arquivo alterado: `frontend/vendas-fora-pdv.html` (bloco de impressão, antes nas linhas ~816-910).

### 1. Documento A4 gerado (funções)
- `cabecalhoEmpresaHTML(compacto)` — cabeçalho com logo, nome, CNPJ, endereço e contato
  (usa `CONFIG.logo` como data URI, mesmo padrão do `caixa.html`). Modo compacto p/ fichas.
- `paginaContratoHTML(v, via)` — página de contrato (1 por via).
- `fichaCarneHTML(v, p)` — uma ficha de carnê (recibo + linha de dobra + cobrança).
- `carneHTML(v)` — agrupa as fichas em páginas, **3 fichas por folha A4**, com linha
  pontilhada "CORTE AQUI" entre elas.
- `imprimirContrato(v)` — monta o HTML completo e imprime via **iframe oculto**.
- `imprimirQuandoPronto(win, tentativa)` — espera documento e imagens (logo) carregarem
  e então chama `print()`.

### 2. Estrutura do que sai impresso
1. **Contrato (2 vias)** — "1ª VIA - LOJA" e "2ª VIA - CLIENTE":
   - Cabeçalho da empresa
   - Venda nº, data/hora, operador, cliente + celular
   - Tabela de itens (código, produto, qtd, unit., subtotal)
   - Totais: subtotal, desconto, **total**
   - Plano de pagamento (parcela/vencimento/valor)
   - Declaração de obrigação de pagamento
   - Assinaturas do **Comprador** e do **Vendedor (Lojista)**
2. **Carnê (somente quando 2+ parcelas)** — fichas empilhadas, 3 por folha A4. Cada ficha:
   - **Recibo destacável** (topo): parcela N/M, vencimento, valor, "Recebemos de...",
     campos de data e forma de pagamento, assinatura do lojista
   - **Linha pontilhada de dobra** separando recibo da cobrança
   - **Ficha de cobrança**: "CARNÊ DE VENDA A PRAZO", parcela N/M, vencimento e
     **valor a pagar** em destaque, venda nº, cliente, condição e observações
   - **Linha "CORTE AQUI"** entre as fichas
- Venda com **1 parcela** → imprime só o contrato (2 vias), sem carnê.

## Correção do dia (problema relatado pelo usuário)

**Sintoma:** "A tela de impressão não aparece, só informa quantas vezes foi parcelado."

**Causa raiz:**
- Não havia impressão automática após o cadastro — só o `alert()` com a confirmação
  (que mostra "Parcelas: Nx").
- `imprimirContrato()` usava `window.open(...)` + `w.print()`. Quando chamado de dentro
  de `setTimeout`/fluxo assíncrono (ex.: botão "Imprimir" da lista, que faz `abrirDetalhe`
  async + `setTimeout`), o navegador **bloqueia a janela popup** → `w` fica `null` →
  exceção → a tela de impressão nunca abre.

**Correção aplicada:**
1. `imprimirContrato(v)` agora escreve o documento num **iframe oculto** criado na própria
   página (`#impressao-a4`, `position:fixed; width:0; height:0; bottom:0; right:0`) e
   chama `iframe.contentWindow.print()`. Funciona mesmo com popup bloqueado e de contexto
   assíncrono.
2. Em `registrarVenda()`, após registrar a venda com sucesso, busca o detalhe completo
   (`GET /api/vendas-fora-pdv/:id`) e chama `imprimirContrato(detalhe)` automaticamente.
   O `alert()` continua mostrando a confirmação; a impressão abre em seguida.

## Backend consultado (sem alterações)

`backend/src/routes/vendasForaPdv.ts`:
- `POST /api/vendas-fora-pdv` — cadastra a venda; resposta: `{ id, numero, total, subtotal,
  desconto, parcelas (qtd), cliente, data, nfe }`.
- `GET /api/vendas-fora-pdv` — lista (máx 100).
- `GET /api/vendas-fora-pdv/:id` — **detalhe completo p/ impressão**: itens (codigo, nome,
  quantidade, unitario, subtotal) e parcelas (numero, vencimento, valor, status, dataPagamento).
- `POST /api/vendas-fora-pdv/:id/parcela/:parcelaId/baixar` — baixa uma parcela.

## Verificações feitas

1. Sintaxe do script: `node --check` — OK.
2. Teste ponta a ponta em Chrome headless (via CDP, mockando `fetch` para NÃO tocar no banco):
   - Login real em `http://localhost:3001/login.html` (operador de teste: admin@mercadinhosilva.com).
   - Cadastro simulado (2 parcelas) → payload POST correto.
   - `GET /api/vendas-fora-pdv/:id` disparado automaticamente após o alert.
   - Iframe `#impressao-a4` criado com: 2 contratos (vias), 2 fichas de carnê, 2 recibos,
     1 "CORTE AQUI", VALOR A PAGAR, assinaturas — tudo presente.
3. Estrutura do HTML gerado (preview real capturado antes da correção do iframe):
   4 páginas A4 (2 contratos + carnê 3 fichas + 1 ficha), CSS `@page A4`, quebras de página,
   `page-break-inside: avoid` nas fichas, bordas pontilhadas de dobra/corte.
   Preview PDF: `C:\Users\jonat\AppData\Local\Temp\opencode\carne-preview.pdf` (temp).

## Observações / possíveis próximos passos

- O usuário pode querer **imprimir carnê também na venda de 1 parcela** (hoje imprime só o
  contrato). Decisão pendente.
- Testar a impressão real no navegador usado na loja (confirmar que o iframe 0x0 abre o
  diálogo de impressão no Chrome/Edge).
- O logo vem de `CONFIG.logo` (data URI). Se não houver logo configurada, o cabeçalho sai
  sem imagem.

## Como testar manualmente

1. Rodar o backend (porta 3001) e abrir `http://localhost:3001/vendas-fora-pdv.html`.
2. Preencher cliente, adicionar produto (código), parcelas = 2+, data da 1ª parcela.
3. Clicar em "Registrar Venda a Prazo" (ou F12).
4. Após o alert de confirmação, a tela de impressão A4 deve abrir (contrato 2 vias + carnê).
5. Nos botões "Imprimir" da lista de vendas, o preview também deve abrir.

## Scripts de teste usados (temporários, em C:\Users\jonat\AppData\Local\Temp\opencode\)

- `cdp-vfp.mjs` — teste antigo (mock de window.open), antes da correção.
- `cdp-vfp2.mjs` — teste atual (mock de fetch + iframe), após a correção.
- `check-vendas.mjs` — consulta rápida das últimas vendas (rodado de dentro de `backend/`).
