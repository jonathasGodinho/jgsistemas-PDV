# JG Sistemas — Andamento do Projeto

> Resumo da conversa (03/08/2026) para retomada. Atualize este arquivo ao final de cada sessão.

## Objetivo
Implementar no ERP JG Sistemas (estilo Ecocentauro) os módulos:
Tabelas de Preço → Promoções → Troca/Devolução → Inventário → Crédito → Cobrança/Inadimplência + Renegociação → Recebíveis de Cartão.

## Ambiente
- Backend: Express 5 + Prisma/PostgreSQL + TypeScript (ts-node-dev), porta **3000**.
- Frontend: HTML estático em `frontend/`, servido na raiz.
- Servidor roda em background; log em `C:\Users\jonat\AppData\Local\Temp\opencode\server.log`; reinicia sozinho via ts-node-dev a cada edição.
- Para iniciar o servidor (se parar): usar `Start-Process` com `npm.cmd` (o alias `npm` falha com "não é um aplicativo Win32 válido").
- Prisma sem migrations: `npx prisma db push --accept-data-loss` + `npx prisma generate` (matar processo na porta 3000 antes, por EPERM no DLL).
- Operadores do ERP principal: `admin@teste.com` (ADMIN), `caixa1@jg.com` / `caixa2@jg.com` (SELLER) e `sousagodinhojonathas@gmail.com`. Login usa `identificador` + `senha`. Senhas rotacionadas em 14/08/2026 (ver "Correções recentes").
- SELLER vê/interage só com registros próprios. Rotas novas usam `requerPermissao('ADMIN','MANAGER','SUPERVISOR')` (trocas também `STOCKIST` no inventário).
- Senha ADMIN obrigatória em: desconto acima do limite, cancelamento venda/item PDV, ajuste cashback, análise de crédito (aplicar limite), troca/devolução e renegociação de crediário.
- Regras de preço: `resolverPreco` (tabela do cliente → tabela padrão → base; linha de variante priorizada; `minQuantity` maior aplicável; `price` fixo ou `percentAdjust` sobre o base).
- Promoções revalidadas **sempre no servidor** na finalização (`calcularPromocoes`); desconto de promo soma ao desconto manual; nome das promo gravado em `Sale.notes` como `PROMO: ...`.
- Prisma `inventoryMovement.type` aceita `SALE`, `RETURN`, `ADJUSTMENT`.
- Frontends usam padrão `api()` via `localStorage.jg_operador` (token). `.html` novos servidos 200 na raiz. JS validado com `node --check` (extraindo `<script>` inline).

## Concluído
1. **Módulo 1 — Tabelas de Preço + Promoções** (testado via API):
   - Schema: `PriceTable`/`PriceTableItem`, `Promotion`/`PromotionProduct` (`targetCategoryIds`, `targetBrandIds`), `Customer.priceTableId`. `db push` aplicado.
   - `backend/src/utils/preco.ts` (`resolverPreco`), `backend/src/utils/promocoes.ts` (`calcularPromocoes`).
   - Rotas: `tabelas-preco.ts` (CRUD) e `promocoes.ts` (CRUD + `POST /aplicar`), registradas em `server.ts`.
   - Integração em `vendas.ts`, `vendasForaPdv.ts` (clienteId no body, preço por tabela, revalida promo, `discount` = manual + promo, nota PROMO) e `produtos.ts GET /:codigo` (`?clienteId&qtd` → preço; retorna `precoBase`).
   - Testes OK: 6 un LEVE3PAGUE2 → R$ 5,72; venda 000034.

2. **Módulo 2 — Troca/Devolução + Inventário** (testado via API):
   - `trocas.ts`: busca venda COMPLETED, valida devoluções, estorno `RETURN`, novos itens com tabela+promo, `sale.update(REFUNDED)`, parcela/transação pendente → CANCELLED, financeiro da diferença, exige senha admin. Registrado em `/api/trocas`.
   - Teste OK: venda 000034 → devolveu 2 un / novos 1 un → diferença -0,26 (nova venda 000035).
   - `inventario.ts`: abrir contagem (espelho da filial, bloqueia OPEN), lançar contagem, finalizar (ajustes `ADJUSTMENT` + auditoria), cancelar OPEN. Permissões incluem STOCKIST. Registrado em `/api/inventario`.
   - Teste OK: contagem "TESTE CONTAGEM" (20 itens, 5 conferidos, 0 divergências, CLOSED).

3. **Módulo 3 — Crédito/Cobrança + Renegociação** (testado via API):
   - `utils/credito.ts` (`calcularAnaliseCredito` → score 0–100, faixa, limite sugerido).
   - `clientes.ts`: `GET /:id/analise-credito` e `POST /:id/analise-credito/aplicar` (senha admin, grava `CreditScore`). Teste OK: score 35 REGULAR, limite 0→68.
   - `relatorios.ts`: `GET /api/relatorios/inadimplencia` (clientes + vendas aninhadas, dias de atraso).
   - `crediario.ts`: `POST /:id/renegociar` (cancela PENDING/OVERDUE, novo cronograma + juros, financeiro, senha admin). Teste OK: 56,70 + 2% = 57,83 em 6x.

4. **Frontends novos**: `tabelas-preco.html`, `promocoes.html`, `trocas.html`, `inventario.html`, `cobranca.html` (JS validado com `node --check`).

5. **Módulo 5 — Recebíveis de Cartão** (testado via API, 05/08/2026): schema (`CardBrand`/`CardOperator`/`CardOperatorFee`/`CardReceivable`), `utils/cartao.ts`, rotas `/api/cartoes`, integração no PDV (venda/efetivar/cancelar), frontends `recebiveis.html` e `operadoras.html`, selects de operadora/bandeira no `pdv.html`. Detalhes na seção dedicada abaixo.

5. **Integração em páginas existentes**:
   - `clientes.html`: select de tabela de preço no cadastro + botão "Crédito" (modal análise com score/faixa/limite sugerido e aplicar com senha admin). Backend `clientes.ts` aceita/retorna `priceTableId` no GET/POST/PUT.
   - `pdv.html`: select cliente/tabela (preço recalculado ao trocar cliente ou somar qtd via `GET /produtos/:codigo?clienteId&qtd`); modal de pagamento com linha "Desconto Promoção" (via `POST /promocoes/aplicar`); `clienteId` enviado na venda/orçamento.
   - `consultas.html`: botão "Troca" nas vendas COMPLETED (link `/trocas.html?numero=...`).
   - `index.html`: novos módulos Tabelas de Preço, Promoções, Troca/Devolução, Inventário, Cobrança/Inadimplência.

## Cashback (como funciona hoje)
- Ganho: **em Venda Fora do PDV** (`vendasForaPdv.ts`) e **no PDV** (`vendas.ts`) com cliente selecionado: credita `%` configurável (`cashback_percentual` em Configurações) do total na `CashbackBalance` do cliente (`CASHBACK_CREDITO`, 1 ponto = R$ 0,01). Ajuste manual em Fidelidade/Cashback exige senha admin.
- Uso: campo **"Resgatar Cashback (R$)"** no PDV (modal de pagamento) e em Venda Fora do PDV (valida saldo, lança `CASHBACK_RESGATE`, exige senha admin). No PDV o resgate não é permitido em orçamentos.
- Consulta: tela Fidelidade/Cashback + `/api/clientes/:id/situacao`; cashback soma até +10 no score de crédito.

## Módulo 5 — Recebíveis de Cartão (testado via API)
- **Schema**: `CardBrand`, `CardOperator`, `CardOperatorFee` (unique `operatorId+brandId+method+installments`), `CardReceivable` (status PENDING/ANTECIPATED/PAID/CANCELLED); `SalePayment.cardOperatorId/cardBrandId`. `db push` aplicado e client gerado.
- **`utils/cartao.ts`**: `resolverTaxaCartao` (bandeira → genérica → 0, taxa depende do nº de parcelas do recebível) e `criarRecebiveisCartao` (crédito = 1 recebível/parcela D+ crédito; débito = 1 único D+ débito; divisão em centavos).
- **Rotas** `cartoes.ts` (`/api/cartoes`): CRUD operadoras/bandeiras/taxas (admin), `GET /recebiveis` (resumo + lista filtrada), `POST /recebiveis/:id/baixar`, `POST /recebiveis/:id/antecipar`, `POST /recebiveis/antecipar-pendentes`. Permissões: recebíveis para ADMIN/MANAGER/SUPERVISOR/FINANCIAL.
- **Integração PDV** (`vendas.ts` POST `/` e `/efetivar`): resolve operadora (informada ou padrão ativa) + bandeira, gera recebíveis no `SalePayment` de cartão, grava operadora/bandeira no pagamento; cancelamento de venda cancela recebíveis PENDING. Resposta inclui `recebiveisLiquido`.
- **Frontends novos**: `recebiveis.html` (cards de resumo, filtros, baixar/antecipar/lote) e `operadoras.html` (abas operadoras/bandeiras/taxas). `pdv.html`: selects de operadora + bandeira no pagamento cartão.
- **Testes OK**: taxas crédito 1x/3x/debito; venda crédito 3x (R$ 3,96 → 3 recebíveis D+30) e débito (R$ 1,98 → 1 D+1); baixa (PAID), antecipação individual 2% (ANTECIPATED), lote pendentes; validações de estado; cancelamento da venda 000041 cancelou o recebível. Test data no banco: vendas 000039–000041, operadora TESTE, bandeira TESTE VISA.

## Módulo 5b — Integração Recebíveis ↔ Financeiro (Contas a Receber) (testado via API, 04/08/2026)
- **Schema**: `FinancialTransaction.cardReceivableId` (`@unique`, relação 1:1 com `CardReceivable`). `db push` aplicado.
- **Geração**: `criarRecebiveisCartao` cria, para cada recebível, uma conta RECEIVE (categoria `CARTÃO`, status PENDING/OVERDUE, vencimento = repasse) ligada por `cardReceivableId`. Descrição: `REPASSE CARTÃO <OPERADORA> - VENDA <Nº>`.
- **Sincronização ida (recebíveis → financeiro)** em `cartoes.ts`: `baixar` marca a conta PAID (`paidAmount` = líquido); `antecipar`/`antecipar-pendentes` marcam PAID (`paidAmount` = líquido − taxa, nota sobre antecipação). Função `garantirContaFinanceira` recria a conta para recebíveis sem contrapartida.
- **Sincronização volta (financeiro → recebíveis)** em `financeiro.ts`: baixar conta `CARTÃO` marca o recebível PAID; cancelar conta marca o recebível CANCELLED.
- **Cancelamento de venda** (`vendas.ts`): cancela recebíveis PENDING + contas financeiras vinculadas.
- **Frontends**: `recebiveis.html` mostra coluna "Financeiro" (status da conta + link) e link para `/financeiro.html`; `financeiro.html` ganhou botão "Recebíveis de Cartão" na aba Contas a Receber.
- **Backfill**: script one-off criou contas financeiras para recebíveis antigos (vendas 000039–000041).
- **Bug pré-existente corrigido**: `estoque.ts` GET `/` quebrava com `ProductVariant is not iterable` (include faltando `ProductVariant` no produto).
- **Testes OK**: venda 000042 crédito 3x (R$ 3,96) → 3 recebíveis + 3 contas PENDING; antecipação 1/3 com 2% → R$ 1,26 na conta PAID; baixa 2/3 → R$ 1,32 PAID; baixa da conta 3/3 no Financeiro → recebível PAID; venda 000043 cancelada → recebível + conta CANCELLED.

## Módulo 5c — Projeção de Repasses D+ (testado via API, 06/08/2026)
- **Backend**: `GET /api/cartoes/projecao?de&ate&operadoraId&bandeiraId` em `cartoes.ts`. Considera apenas recebíveis **PENDENTES** no período (default: hoje até +90 dias). Retorna `resumo` (bruto/taxa/líquido/qtd), `porData` (agrupado por data de vencimento D+, com subdivisão por operadora, datas entre `de` e `ate` preenchidas e só retornadas quando têm repasse) e `porOperadora` (totais + 1º/último repasse). Data formatada no fuso local (`fmtData`) para evitar deslocamento do `toISOString`.
- **Frontend**: página nova `projecao-repasses.html` (cards resumo, filtros operadora/de/até, **gráfico de barras em Canvas puro** sem lib externa, tabela por operadora e tabela dia a dia). JS validado com `node --check`. Links adicionados no header de `recebiveis.html` e em `index.html` (módulo "Projeção de Repasses").
- **Testes OK**: projeção default (8 recebíveis PENDING → R$ 142,71 bruto / R$ 140,93 líquido em 2026-09-03); filtro por operadora idêntico; período 2020 → vazio; página servida HTTP 200.

## PDV — Fluxo Ecocentauro + Atalhos + Venda sem NFC-e (07/08/2026)
- **Fluxo de fechamento (padrão Ecocentauro)**: ao confirmar o pagamento, o PDV fecha o modal de pagamento e abre a tela menor **"Enviando para a SEFAZ"** (spinner, "Transmitindo a NFC-e, aguarde..."). Quando a resposta volta (a emissão já é síncrona no `POST /api/vendas`), mostra "NFC-e autorizada" (ou "Venda registrada — NFC-e não autorizada") por ~1,2s e **imprime o comprovante automaticamente**. A janela de impressão é aberta no gesto do clique (evita bloqueio de popup). Depois limpa a tela para nova venda.
- **Atalhos do PDV** (`pdv.html`): `ENTER` lançar item, `F2` busca de cliente (novo modal), `F3` busca de produto, `F7` cancelar item (senha admin), **`F8` venda sem NFC-e**, `F12` fechar venda. Rodapé atualizado.
- **Venda sem NFC-e (F8)**: mesmo modal de pagamento; envia `naoEmitirNfe: true` no body; o backend (`vendas.ts` POST `/`) pula `emitirNfceSeHabilitado` e retorna `nfe: null`; venda fica COMPLETED normalmente (estoque, pagamento, recebíveis, cashback) e pode ter a NFC-e emitida depois em Consultas. No frontend, pula a tela SEFAZ e imprime o cupom direto (sem rodapé fiscal).
- **Testes OK**: venda 000055 com `naoEmitirNfe:true` → COMPLETED, `nfe:null`; venda 000056 normal → COMPLETED, NFC-e AUTORIZADA (homologação). JS do `pdv.html` validado com `node --check`.

## PDV - Multi-telas para ADMIN (07/08/2026)
- **Objetivo**: com o PDV aberto, o ADMIN consegue abrir outros módulos em **nova aba** sem perder a venda em andamento (ex.: produto com estoque zerado → abre Estoque, dá entrada e volta para confirmar a venda).
- **Links do header** (MENU / CAIXA / GESTÃO) agora abrem em nova aba (`target="_blank" rel="noopener"`) — a venda fica preservada na aba do PDV.
- **Botão flutuante "MÓDULOS"** (`#modulos-float`): aparece apenas para operador não-SELLER; abre menu com **Estoque** e **Clientes** via `window.open`. Fecha ao clicar fora. Token do `localStorage` é compartilhado entre abas (continua logado).
- **Erro de estoque inline**: quando o backend responde `Estoque insuficiente para: <produto>` no `confirmarVenda`, em vez de `alert` o `modal-pagamento` reabre com a caixa vermelha `#pg-erro` (mensagem + botão "Abrir Estoque (nova aba)" para ADMIN + dica). Itens e pagamento já preenchidos permanecem.
- **Re-sincronização ao voltar**: `window focus` dispara `atualizarEstoqueItens()` (`GET /api/estoque` → mapa `codigo→quantidade` → `item.estoque`). Itens sem saldo suficiente ficam em vermelho (`tr.linha-sema-estoque`) e o banner `#aviso-estoque` avisa. Também roda 1x ao abrir o PDV e ao falhar a venda por estoque.
- **Testes OK**: produto novo com estoque 0 → `POST /api/vendas` retorna `Estoque insuficiente`; `POST /api/estoque/entrada` (+5) → nova venda completa com estoque 5→3 (movimentações IN e SALE no histórico). JS do `pdv.html` validado com `node --check`; página servida HTTP 200.

## Login - Logo + Contato de Suporte (07/08/2026)
- **Logo**: arquivo `Logo JG Sistemas.png.png` (Downloads) copiado para `frontend/logo-jg.png` (nome limpo). O círculo verde "JG" do topo do `login.html` foi substituído por cartão branco arredondado com `<img>` (220px de largura, `object-fit:contain`). Servida em `/logo-jg.png` (HTTP 200).
- **Suporte**: adicionada linha `Suporte: (62) 98219-9003` abaixo do subtítulo "Sistema de Gestão Comercial" (`.topo .suporte`). JS do `login.html` validado com `node --check`.

## Módulo SaaS — Painel de Gestão Multi-Cliente (07/08/2026)
- **Modelo**: SaaS puro (Bling/ContaAzul style). Cliente não instala nada — só abre a URL e loga. Sem chave/fingerprint/tolerância offline. Você controla o acesso suspendendo a instância do inadimplente.
- **Arquitetura**: single-tenant por instância (código ERP intacto). 1 banco PostgreSQL + 1 instância do backend por cliente (mesmo código, muda `DATABASE_URL` + `PORT`). Porta 3000 = dev local; clientes = 3001+.
- **`painel/`** (JS puro, porta 3100): `src/server.js` (API + auth bcrypt), `src/orquestrador.js` (criarBanco via `createdb.exe`, `prisma db push`, `provisionar.ts`, spawn/kill instâncias), `src/store.js` (JSON `dados/clientes.json`), `public/painel.html`. Login padrão: `jgadmin123` (hash em `dados/painel.senha`, criado no 1º login).
- **Fluxo**: cadastrar cliente → provisionar (cria banco `jg_<slug>` + schema + admin `admin@<slug>.com` + senha gerada 8 chars, inicia instância) → suspender/reativar a qualquer momento.
- **Instância**: `node -r ts-node/register src/server.ts` com `TS_NODE_TRANSPILE_ONLY=1` (obrigatório por `verbatimModuleSyntax`). Logs em `dados/logs/<id>.log`.
- **Testes OK**: clientes Mercadinho Silva (3001) e Padaria Pão Quente (3002) — login ADMIN OK; suspensão derrubou acesso à porta 3002; reativação restaurou (HTTP 200).
- **Pendências**: vencimento automático, cobrança PIX, alerta de inadimplência, deploy VPS (Nginx subdomínio + PM2 + Let's Encrypt).

## Módulo 6 — Conciliação com extrato da operadora (BACKEND PRONTO — falta só o frontend)
- **Feito (07/08/2026)**: modelos `CardStatementImport` e `CardStatementLine` em `backend/prisma/schema.prisma`, `db push` aplicado e client regenerado.
- **Backend completo (08/08/2026, dentro desta sessão)**: `utils/concilia.ts` (parser do extrato CSV/txt + normalização + `procurarRecebivel` com match por valor/faixa de data/operadora priorizando PENDING) e `routes/conciliacao.ts` (`POST /importar`, `GET /importacoes`, `GET /importacoes/:id`, `POST /importacoes/:id/linhas/:linhaId/conciliar`, `POST /importacoes/:id/aplicar` — baixa recebíveis MATCHED → PAID + contas CARTÃO — e `POST /importacoes/:id/cancelar`). Registrado em `server.ts` em `/api/conciliacao` (permissões ADMIN/MANAGER/SUPERVISOR/FINANCIAL).
- **Falta fazer (próxima sessão)**: `frontend/conciliacao.html` (listagem de importações + detalhe com abas MATCHED/UNMATCHED, ações por linha e "Aplicar conciliação" com senha admin) + links em `index.html` e `recebiveis.html`. Padrões de referência: `cartoes.ts`, `recebiveis.html`.

## Pacote de Segurança Completo (08/08/2026)

Escopo: resposta à pergunta "o que acontece se um hacker tentar invadir?" → implementado na íntegra e testado via API.

- **Rate limiting por IP** (`backend/src/middlewares/rateLimit.ts`, registrado em `server.ts`): `/api` 300 req/60s, `/api/auth/login` 10 req/60s → HTTP 429 com `Retry-After`. Testado: 13 requisições em 1 janela bloquearam até o admin até expirar.
- **Auditoria de acessos** (`LoginAudit`, `backend/src/routes/auth.ts` GET `/logins`): registra data, operador, identificador, IP, sucesso, `detail` ("tentativa 1 de 5", "IP já conhecido", "operador não encontrado") e flag `suspeito`. Endpoint `POST /api/auth/logins/:id/suspeito` marca manualmente. Filtros: `de`, `ate`, `usuario`, `resultado`, e resumo `falhas24h`. Testado: 26 registros, bloqueio por força bruta aparece como 429.
- **Bloqueio de força bruta**: `seg_login_max_tentativas` (5) + `seg_login_travamento_min` (15) — excedeu → 429 com mensagem de aguardar. Testado com `caixa1@jg.com` senha errada.
- **Troca de senha obrigatória**: senha padrão `123456` força `trocar-senha` na tela de login; rota `POST /api/auth/trocar-senha` com política de senha (`utils/senhas.ts`: mínimo, número, maiúscula, símbolo — configurável), senhas comuns rejeitadas e proibição de reutilizar as últimas. Sessões revogadas após a troca.
- **Gestão de sessão**: token em banco (`sessionToken`/`sessionExpiresAt`), expiração configurável (`seg_sessao_horas`), `POST /logout` e revogação por operador (`POST /api/auth/revogar-sessoes/:id`). Sessão expirada → 401 e frontend redireciona ao login.
- **Configurações de Segurança** (`configuracoes.ts` GET/POST `seguranca`): tentativas, travamento, sessão, política de senha. Painel novo em `configuracoes.html` (seção "Segurança") com formulário + persistência via `salvarSetting`. Testado: valores atuais lidos OK.
- **XSS no frontend**: `frontend/seguranca.js` com `esc()`/`escapeHtml()`; `<script src="/seguranca.js">` adicionado em todas as páginas (29/29) e interpolações de texto livre vindas da API envolvidas com `esc()` nas páginas de cadastro, financeiro/cartões e vendas/geral. `auditoria.html` e `configuracoes.html` já usam `esc()` inline. JS validado com `node --check` em todas as páginas.
- **`TRUST_PROXY`**: `.env` ganhou `TRUST_PROXY=1` (IP real do cliente via Nginx); `server.ts` já lia a variável.
- **Docs e operação**: `docs/DEPLOY-SEGURO.md` (firewall, Nginx+Let's Encrypt, PM2, TRUST_PROXY, checklist) e `scripts/backup.ps1` (pg_dump + retenção 7 dias + log, lê credenciais do `.env`).

## Correções recentes
- **Integração do sistema de cadastro de aluno no Painel (14/08/2026)**: entrada única `tipo: "escola"` em `dados/clientes.json` ("Escola de Inglês", porta 5174). O painel passa a gerenciar os 2 processos (backend FastAPI/uvicorn :8000 + frontend Vite :5174, em `ESCOLA_DIR` = `C:\Users\jonat\OneDrive\Desktop\sistema de cadastro aluno`). Novas rotas `POST /api/clientes/:id/iniciar|parar` (apenas para `tipo: escola`; provisionar/suspender/reativar recusam para ela). `religar` do boot sobe a escola junto com os ERPs. UI: linha com badge RODANDO/PARADO e botões Abrir/Iniciar/Parar. Bootstrap do admin (`admin@escola.com`) só na 1ª execução (banco sem usuários) — o banco real já tinha admin (em `backend/escola.db`, com 12 alunos), então não foi sobrescrito. O `escola.db` na raiz do projeto (0 bytes) é um arquivo perdido/duplicado — não é usado. Logs em `dados/logs/<id>.log`.
- **Hardening + rotação de senhas (14/08/2026)**: (a) ERP e Painel: bloqueio 403 de crawlers de IA/LLM e scrapers por User-Agent (GPTBot, ClaudeBot, PerplexityBot, CCBot, Google-Extended, etc.), guarda anti-injeção SQLi/XSS em query/corpo/parâmetros (400; campos de senha/imagem/base64/xml ignorados), `robots.txt` (Disallow all), `app.disable('x-powered-by')`, `dotfiles:'ignore'` no static e meta `noindex/nofollow` nas páginas de entrada. Painel ganhou rate limit de login (10/min/IP) e body limit 100kb. `painel/src/bloqueador.js` (página de cliente suspenso) com headers CSP/nosniff/frame + noindex. (b) Senhas rotacionadas para aleatórias fortes em **todos** os operadores: ERP principal (`backend/src/rotacionar-senhas.ts`) e clientes SaaS (`backend/src/rotacionar-senhas-cliente.ts`, um por banco `jg_<slug>`); todas com `mustChangePassword=true` e sessões revogadas. PostgreSQL `jgadmin` rotacionado (refletido em `backend/.env` e `painel/src/config.js`); painel com senha rotacionada (hash em `dados/painel.senha`) e senha padrão aleatória via env `PAINEL_SENHA`. Testes OK: typecheck verde, bots→403, injeção→400, logins com as novas credenciais. **As novas senhas NÃO estão neste arquivo** (entregues no chat); recuperáveis rodando os scripts de rotação novamente.
- **Segurança — C1 e C2 do relatório (14/08/2026)**: (a) `configuracoes.ts` agora restringe `POST /api/configuracoes` a ADMIN/MANAGER/SUPERVISOR (`requerPermissao`) e mascara o segredo fiscal `csc`/`cscId` no GET para os demais perfis; `configuracoes.html` bloqueia a página para quem não tem esses perfis. (b) Painel SaaS: `painel/src/server.js` não grava mais a senha do admin do cliente em `dados/clientes.json` — ela é devolvida **uma única vez** na resposta do provisionamento (`semSenha()` sanitiza a listagem e a limpeza no boot remove `adminSenha` de registros antigos). Senhas antigas já gravadas foram removidas do arquivo. Testes OK: SELLER não lê `csc` (vazio) e recebe 403 no POST; `GET /api/clientes` do painel sem `adminSenha`; `clientes.json` sem `adminSenha`.
- **Abertura de caixa sem fundo (07/08/2026)**: o PDV/fluxo Ecocentauro abria a registradora mesmo com o campo "Fundo de Caixa" vazio, gravando `openingBalance = 0` (vários caixas históricos com fundo 0). Correção em `backend/src/routes/caixa.ts` (`POST /abrir` agora exige `valorInicial`, rejeita vazio com mensagem clara e valida valor não negativo) e `frontend/caixa.html` (`abrirCaixa()` valida o campo antes de abrir, foca no campo quando vazio, e a tecla `ENTER` no campo de fundo dispara a abertura). Teste OK: abrir sem valor → 400 "Informe o valor do fundo de caixa"; abrir caixa 2 com R$ 150 → gravado; fechado após teste.
- **Fundo de caixa no fluxo Ecocentauro (07/08/2026, caixa.html)**: campo "Fundo de Caixa (R$)" padronizado com o mesmo tamanho/cor do nº da registradora (220px, borda/texto iguais). Ao digitar, o número fica azul; ao pressionar `ENTER` o valor é formatado com 2 casas decimais (`150` → `150,00`), o campo é bloqueado (`readonly`, o caixa não pode mais alterar), o número fica verde (`#008c45`) e o cursor sai do campo (foco no botão "Abrir Caixa"). Ao sair sem `ENTER`, formata também mas permanece editável. Removida a opção **"Reabrir"** do histórico (caixa fechado só permanece fechado) e removida a rota `POST /api/caixa/cancelar-fechamento/:id` (404). Ao não haver caixa aberto, o fundo é **sempre limpo** (não reaproveita o valor do fechamento anterior). JS validado com `node --check`; página servida HTTP 200.
- **Instâncias SaaS desatualizadas (08/08/2026)**: após o pacote de segurança, os bancos dos clientes provisionados (Mercadinho 3001, Padaria 3002) estavam com schema antigo → a API das instâncias quebrava com erro de coluna (`prisma.user.findMany` / coluna inexistente) e a Padaria nem subia. Correção: reativar a instância pelo painel (`POST /api/clientes/:id/reativar`) + rodar `prisma db push` no banco de cada cliente (`DATABASE_URL` = mesma URL do `.env` do backend trocando o nome do banco por `jg_<slug>`). Teste OK: login ADMIN nas duas. **Regra**: sempre rodar `db push` nos bancos SaaS quando o schema mudar.
- **Bug suspensão do SaaS (07/08/2026)**: suspender um cliente só matava o processo rastreado no mapa em memória do orquestrador. Instâncias órfãs (iniciadas antes de o painel reiniciar ou fora dele) não eram derrubadas, e o bloqueador falhava com `EADDRINUSE` — o usuário continuava acessando o ERP normalmente. Correção em `painel/src/orquestrador.js`: funções `matarPorta`/`portaOcupada` (via `netstat` + `taskkill`, por porta), `pararInstancia`/`pararBloqueio` agora também liberam a porta, `iniciarInstancia`/`iniciarBloqueio` viraram `async` com `child.on('error')`, e `religar` mata órfãos de clientes SUSPENSOS antes de subir o bloqueio. `painel/src/server.js`: rotas suspender/reativar/provisionar aguardam as funções assíncronas e `GET /api/clientes` reporta status real por porta ocupada. Teste OK: ciclo reativar (ERP na porta) → suspender (403 em `/api/*` + página de aviso).
- **PDV (04/08/2026)**: removidos os campos "Operadora de Cartão" e "Bandeira (opcional)" do modal de pagamento. O backend continua resolvendo a operadora padrão ativa e a bandeira genérica (taxa MDR genérica) quando nenhuma é informada. Desconto no PDV: a aplicação automática de promoções ativas é mantida (escolha do usuário).
- **Bug "Limite de crédito excedido" (04/08/2026)**: havia 2 clientes com o mesmo nome (JONATHAS GODINHO DE SOUZA — limite R$ 1000 / R$ 2). `vendasForaPdv` resolvia o cliente por nome (`findFirst` insensível) e podia pegar o registro errado. Correção: o frontend agora envia `clienteId` (ID selecionado na busca) e o backend resolve por ID quando informado, caindo para nome apenas se não houver ID. Teste OK: venda 000037 (R$ 1,98) vinculada ao cliente de limite R$ 1000.
- **Bug taxa MDR genérica (05/08/2026)**: `findUnique` do Prisma rejeita `brandId: null` no índice composto de `CardOperatorFee` (erro 500). Corrigido usando `findFirst`. Teste OK.
- **Nota**: registros duplicados de cliente por nome continuam existindo no banco; a busca por nome digitado manualmente ainda pode pegar o primeiro encontrado.

## Pendências / Pontos de Atenção
- **Próximo passo sugerido**: concluir a **conciliação automática** — backend (`utils/concilia.ts`, `routes/conciliacao.ts`) já pronto e registrado em `/api/conciliacao`; falta `frontend/conciliacao.html` + links em `index.html`/`recebiveis.html` (detalhes na seção "Módulo 6").
- **Segurança (08/08/2026)**: pacote completo implementado e testado (rate limit, bloqueio força bruta, auditoria de acessos, troca de senha obrigatória, política de senha, gestão de sessão, configurações, XSS `esc()` em todas as páginas, `TRUST_PROXY`, docs e backup). Conferir na seção "Pacote de Segurança Completo" acima. Recomendado no deploy: usar senha forte, HTTPS e revisar `docs/DEPLOY-SEGURO.md`.
- **Estado dos serviços (08/08/2026 ~19h, após correção)**: ERP dev na porta **3000**; Painel SaaS na **3100**; instâncias SaaS: Mercadinho **3001** (ATIVO, login OK) e Padaria **3002** (ATIVO, login OK). Conferir com `Get-NetTCPConnection -LocalPort 3000,3001,3002,3100 -State Listen`.
- Cashback no PDV já implementado e integrado (ganho em venda com cliente + resgate no modal com senha admin); falta regressão visual/relatórios.
- `tsc --noEmit` verde (config corrigida em 14/08/2026: `module: commonjs`, `moduleResolution: node10`, `lib: esnext`, `types: ["node"]`). Rodar `npm run typecheck` no backend.
- PowerShell: `$pid` é read-only (usar `$p` ao matar porta 3000).
- Páginas `.html` são validadas com `node --check` (extrair scripts inline para arquivo temporário). Rodar `node --check` em qualquer `.html`/`.js` novo antes de considerar pronto.

## Comandos úteis
- Ver servidor: `Get-Content Temp\opencode\server.log -Tail 30`
- Matar porta 3000: `Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
- Login/API de teste: `Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType application/json -Body '{"identificador":"admin@teste.com","senha":"<senha-rotacionada>"}'` (senhas atuais não são versionadas; recuperáveis rodando `rotacionar-senhas.ts`/`rotacionar-senhas-cliente.ts`)
