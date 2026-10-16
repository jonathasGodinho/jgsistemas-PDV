# Sprint 04 — Entrada de lote/validade e posição por lote

## Objetivo

Registrar lote e validade na entrada de mercadoria (recebimento de compra) e expor o saldo de estoque por lote (D-03).

## Fases

| Fase | Título | Roda em paralelo com |
|---|---|---|
| F-04.1 | Entrada de lote no recebimento de compra | nenhuma |
| F-04.2 | Posição de estoque por lote | nenhuma |

Detalhe de cada fase em `fases.md`; tasks em `tasks.md`.

## Critério de saída

Após receber uma compra de medicamento com lote e validade, existe um Lote com o saldo correto, e `GET /api/estoque` lista o saldo por lote com lote e validade.

## Riscos conhecidos

- O recebimento de compra hoje não captura lote (`docs/farmacia/base/compras.md`) — é preciso estender o payload e a persistência.
- O estoque é agregado (`base/estoque.md`); a posição por lote é aditiva e não deve quebrar a leitura agregada existente.
