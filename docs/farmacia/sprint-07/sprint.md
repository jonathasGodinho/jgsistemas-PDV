# Sprint 07 — PMC / CMED

## Objetivo

Importar a tabela PMC da planilha CMED (upload que substitui a tabela), resolver o PMC do produto pelo Registro MS e bloquear a venda acima do teto — apenas quando o produto tem PMC (D-05, D-08, D-11, D-14).

## Fases

| Fase | Título | Roda em paralelo com |
|---|---|---|
| F-07.1 | Motor de import e resolução de PMC | nenhuma |
| F-07.2 | Upload admin e bloqueio na venda | nenhuma |

Detalhe de cada fase em `fases.md`; tasks em `tasks.md`.

## Critério de saída

Após o upload da planilha CMED por um admin, a tabela PMC é substituída pelas linhas do arquivo; uma venda de item com preço acima do PMC é rejeitada nas duas rotas, e um produto sem PMC vende normalmente.

## Riscos conhecidos

- Não há fonte automática de PMC (`docs/farmacia/base/fiscal-nfce.md` e `base/precos.md`) — o casamento é por Registro MS (D-11), que precisa existir no produto.
- O bloqueio só pode ocorrer quando há PMC (D-08) — a ausência de PMC não pode travar a venda.
- A regra de PMc deve rodar ANTES de persistir a venda, não na emissão da NFC-e (`base/vendas-fora-pdv.md`).
