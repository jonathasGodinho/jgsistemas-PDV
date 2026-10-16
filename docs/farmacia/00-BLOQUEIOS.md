# Bloqueios

## Decisões pendentes registradas na execução (F6)

> Regra da F6: falta de decisão não interrompe nem vira pergunta — é registrada aqui.
> Nenhum item abaixo bloqueia a sprint em que foi registrado.

### B-01 — Cancelamento/devolução de venda não devolve o lote (registrado em 2026-10-13, Sprint 05)

> **RESOLVIDO em 2026-10-16 (D-20).** Livro-razão `LoteMovimento` (migração `20261016120000_farmacia_lote_movimento`, com saldo inicial dos lotes existentes). Cancelamento (`vendas.ts`) e troca/devolução (`trocas.ts`) recompõem o lote exato consumido; troca passou a baixar itens novos por FEFO; venda não sai de lote vencido; entrada/saída/ajuste manuais (`estoque.ts`) mantêm soma dos lotes ≤ estoque; conciliação em `/api/farmacia/lotes/conciliacao` e `/conciliar` (card na tela de estoque). Removido o movimento de estoque duplicado por lote (os lotes vão no motivo do movimento único). Junto: cancelar orçamento não devolve mais estoque (D-21). Cobertura: `backend/tests/farmacia-lote-livro.test.ts` (10 testes); suíte 23 files / 68 tests verde; tela verificada por navegador (D-19).

- **Contexto**: T-05.02 e T-05.03 passaram a baixar lotes (FEFO) na venda do PDV (`backend/src/routes/vendas.ts`, inclusive `POST /:id/efetivar`) e na venda a prazo (`backend/src/routes/vendasForaPdv.ts`).
- **Comportamento atual**: o cancelamento/devolução de venda (rotas de cancelamento em `backend/src/routes/vendas.ts`) devolve apenas `Inventory.quantity` (saldo agregado). Os registros de `Lote` **não** são recompostos, então o saldo por lote fica menor que o saldo agregado depois de um cancelamento.
- **Decisão faltante**: definir se o cancelamento/devolução deve recompor o lote — e, em caso positivo, por qual regra (o lote original consumido, rastreável pelos `InventoryMovement` com `reason` "Venda PDV · Lote X" / "Venda a prazo · Lote X"; ou o lote de maior validade do produto).
- **Impacto se não decidido**: divergência permanente entre saldo agregado e soma dos lotes; o FEFO passa a enxergar menos quantidade do que o estoque real. Nenhuma task das Sprints 06–08 (alertas de vencimento, CMED, fiscal) depende disso — por isso não bloqueia.
- **Não afeta**: produto sem lote (D-09), que segue vendendo e cancelando pelo saldo agregado normalmente.

---

## B-02 — Certificado digital A1 e CSC reais para homologação SEFAZ

- **Aberto em**: 2026-10-14 (Sprint-08, T-08.03).
- **Decisão faltante**: obter o certificado digital A1 da empresa (arquivo `.pfx` + senha) e o CSC/ID do CSC de homologação da SEFAZ-AM para configurar `POST /api/nfe/certificado` e `nfe_config` (`tpAmb: 2`, `csc`, `cscId`).
- **O que já está verificado (sem o certificado real)**: em ambiente simulado — `NFE_CERT_MODE=test` (assinador de teste em `backend/src/nfe/cert.ts`) + `NFE_DRY_RUN=1` (SEFAZ simulada em `backend/src/nfe/sefaz.ts`) — a NFC-e monofásica de medicamento percorre o fluxo completo (lote → recibo → protocolo) e retorna `AUTORIZADA`, com chave de 44 dígitos e XML contendo `tpAmb 2`, `PISNT`/`COFINSNT` e `ICMSST` (`vBCSTRet 140.00` / `vICMSSTRet 7.20`). Cobertura: `backend/tests/farmacia-fiscal-homologacao.test.ts` (2 testes, verdes).
- **O que continua pendente**: o aceite **real** da SEFAZ-AM em homologação (`NFE_DRY_RUN` desligado, com certificado e CSC reais). Não há certificado nem CSC no repositório (`backend/.env` contém apenas `DATABASE_URL`, `PORT`, `JG_CHAVE_CRIPTO`).
- **Impacto**: o critério de aceite D-06 ("Fase 1 pronta" = NFC-e monofásica aceita em homologação) fica **parcialmente comprovado** — lógica fiscal, XML, assinatura e ciclo de autorização verificados por simulação; falta apenas a confirmação contra a SEFAZ real.
- **Como desbloquear**: `POST /api/nfe/certificado` (arquivo `.pfx` + senha) e configurar `nfe_config` com `tpAmb: 2` + CSC/ID do CSC de homologação; depois emitir uma venda de medicamento sem `NFE_DRY_RUN`.

---

## B-03 — Delegação de frontend indisponível (visual-engineering)

- **Aberto em**: 2026-10-14 (Sprints 06–07).
- **Situação**: a categoria `visual-engineering` falhou ao iniciar ("Google Generative AI API key is missing") nas tasks T-06.02 e T-06.03.
- **Contorno adotado**: as telas (`frontend/configuracoes.html`, `frontend/estoque.html`) foram implementadas pelo agente principal, seguindo o padrão das telas existentes.
- **Impacto**: nenhum no escopo funcional; risco de inconsistência visual frente ao padrão do projeto.
- **Verificação**: T-06.03 verificado por navegador (D-19); sem revisão de design dedicada.

---

## B-04 — `shell.js:354` referencia `m` fora de escopo (evento `jg:modulos` não dispara)

> **RESOLVIDO em 2026-10-16.** `carregarModulos` agora dispara `jg:modulos` com `window.jgModulos` em todos os casos (com ou sem lista explícita). Verificado por navegador com `liberados: ['farmacia','estoque']`: evento disparado, zero `pageerror`.

- **Aberto em**: 2026-10-14 (Sprint-08, verificação de tela da T-08.05).
- **Situação (defeito pré-existente, não introduzido pela Fase 1)**: em `frontend/ui/shell.js`, `carregarModulos` declara `const m = await getJSON('/api/sistema/modulos')` **dentro** do `try` (linha 340) e usa `m` **fora** dele em `document.dispatchEvent(new CustomEvent('jg:modulos', { detail: m }))` (linha 354). Com a empresa tendo lista de módulos explícita (`liberados` é um array, vindo do contrato), a linha 354 lança `ReferenceError: m is not defined` e o evento `jg:modulos` nunca é disparado.
- **Evidência**: captura de `pageerror` no navegador em `http://localhost:4600/produto.html?id=999` com `/api/sistema/modulos` respondendo `{ liberados: ['farmacia'] }` → `"m is not defined" at carregarModulos (http://localhost:4600/ui/shell.js:354:72)`; com `liberados` ausente (retorno sem array) não há erro, porque a função retorna antes (linha 348).
- **Impacto**: os gates de módulo aplicados ao **carregar a página** seguem funcionando (`moduloOk` é consultado no init, quando `modulosLiberados` ainda é `null`), mas quem depende do evento `jg:modulos` para reaplicar o gate **depois** da resposta da API (ex.: `aplicarModuloFarmacia` em `frontend/produto.html`, card de vencimento em `frontend/estoque.html`) não é reexecutado quando a empresa tem módulos explícitos — ou seja, a decisão D-02 ("empresa que não contrata não vê") fica sem correção pós-carregamento. A T-03.02 verificou o gate disparando `jg:modulos` manualmente, cenário em que o defeito não aparece.
- **Fora do escopo da Fase 1**: `frontend/ui/shell.js` é o shell compartilhado do ERP (não é arquivo de nenhuma task da Fase 1). Pela regra de não alterar arquivos fora do escopo, o defeito **não** foi corrigido.
- **Como desbloquear/corrigir**: trocar `detail: m` por `detail: window.jgModulos` (o valor já é guardado em `window.jgModulos` na linha 342) e revalidar os gates de módulo por navegador com uma lista `liberados` explícita.
