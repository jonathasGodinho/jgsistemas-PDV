# Estoque (API)

## Contrato de entrada

- Rotas em `backend/src/routes/estoque.ts`.
- `GET /api/estoque` — posição de estoque (`backend/src/routes/estoque.ts:9-52`). Calcula situação por item.
- Entrada e saída de estoque por movimentação. Hoje a operação atualiza `Inventory.quantity` e registra `InventoryMovement` com `type`, `quantity` (negativo na saída), `reason`, `userId` (padrão visto em `backend/src/routes/vendasForaPdv.ts:153-168`).

## Contrato de saída

- Situação por item: `OK` / `SEM_ESTOQUE` / `BAIXO` (`backend/src/routes/estoque.ts:9-52`).
- Posição agregada por produto/variante/filial (sem lote).

## Limites e cotas

- NÃO DOCUMENTADO.

## Erros conhecidos e tratamento

- Estoque insuficiente bloqueia a operação: `Estoque insuficiente para: <produto>` (`backend/src/routes/vendasForaPdv.ts:144-146`).

## Riscos para a nossa implementação

- O estoque é **agregado** (`Inventory.quantity`), sem lote/validade. FEFO exige saber, por lote, quantidade e validade — precisa de nova estrutura e de ajustar baixas atuais (`backend/src/routes/vendasForaPdv.ts:144-168`) e a posição (`backend/src/routes/estoque.ts:9-52`).
- A situação atual (`OK`/`SEM_ESTOQUE`/`BAIXO`) não contempla vencimento; o alerta de vencimento precisa de regra nova (limite de dias) — limiar NÃO DOCUMENTADO.

## Fonte

`backend/src/routes/estoque.ts:9-52`, `backend/src/routes/vendasForaPdv.ts:144-168` — acessado em 2026-10-13
