# Compras (entrada de mercadoria)

## Contrato de entrada

- Rotas em `backend/src/routes/compras.ts`.
- `GET /api/compras` — lista compras (`take: 100`, `backend/src/routes/compras.ts`).
- `GET /api/compras/:id` — detalhe com itens, incluindo `PurchaseItem.Product` (`backend/src/routes/compras.ts`).
- Há fluxo de recebimento de compra (entrada de estoque) no módulo — NÃO DOCUMENTADO o payload exato do recebimento sem releitura integral.

## Contrato de saída

- Lista: compras recentes (até 100). Detalhe: compra + itens + produto relacionado (`backend/src/routes/compras.ts`).

## Limites e cotas

- Listagem limitada a 100 registros (`backend/src/routes/compras.ts`).

## Erros conhecidos e tratamento

- NÃO DOCUMENTADO.

## Riscos para a nossa implementação

- É o ponto natural de **entrada de lote/validade** (compra de medicamento traz lote e validade do fornecedor). Hoje o recebimento não registra lote — será preciso estender `PurchaseItem`/recebimento para capturar lote e validade por item.
- Sem alterar o recebimento, não há como popular lotes para o FEFO funcionar.

## Fonte

`backend/src/routes/compras.ts` — acessado em 2026-10-13
