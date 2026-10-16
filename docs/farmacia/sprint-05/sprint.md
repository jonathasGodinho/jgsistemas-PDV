# Sprint 05 — FEFO na venda

## Objetivo

Vender sempre pelo lote de menor validade (FEFO) nas duas rotas de venda, mantendo o comportamento atual para produtos sem lote (D-09, base: `vendas-pdv.md`, `vendas-fora-pdv.md`, `estoque.md`).

## Fases

| Fase | Título | Roda em paralelo com |
|---|---|---|
| F-05.1 | Serviço FEFO | nenhuma |
| F-05.2 | FEFO aplicado nas vendas | nenhuma |

Detalhe de cada fase em `fases.md`; tasks em `tasks.md`.

## Critério de saída

Uma venda de medicamento com dois lotes baixa o saldo do lote de menor validade primeiro, nas rotas do PDV e fora do PDV, e a venda conclui sem erro para produtos sem lote.

## Riscos conhecidos

- As duas rotas de venda hoje baixam do agregado `Inventory.quantity`, sem lote (`base/vendas-pdv.md`, `base/vendas-fora-pdv.md`) — a integração deve registrar o movimento por lote sem quebrar o saldo agregado.
- Produto sem lote deve continuar vendendo (D-09) — o serviço FEFO precisa tratar o caso vazio sem lançar erro.
