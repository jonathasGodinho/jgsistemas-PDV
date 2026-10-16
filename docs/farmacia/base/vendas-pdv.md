# Vendas no PDV

## Contrato de entrada

- Rotas em `backend/src/routes/vendas.ts` (889 linhas).
- `CAMPOS_NFE` em `backend/src/routes/vendas.ts:21` — campos fiscais montados para a NFC-e.
- `emitirNfceSeHabilitado` em `backend/src/routes/vendas.ts:32` — dispara emissão condicionada à config de NFC-e.
- Fluxo de venda: resolve operador/filial, itens, preço (`resolverPreco`), estoque, cria `Sale`/`SaleItem`/`SalePayment` e movimenta estoque (padrão espelhado em `backend/src/routes/vendasForaPdv.ts:66-370`).

## Contrato de saída

- Venda persistida com itens, pagamentos e (quando habilitado) dados fiscais `nfe*` na `Sale`.

## Limites e cotas

- NÃO DOCUMENTADO (confirmar limites de itens/quantidade por venda no router).

## Erros conhecidos e tratamento

- Estoque insuficiente: `Estoque insuficiente para: <produto>` (`backend/src/routes/vendasForaPdv.ts:144-146`).
- Emissão de NFC-e desativada: status `DESATIVADO` (`backend/src/nfe/eventos.ts:13-15`).

## Riscos para a nossa implementação

- É o ponto onde FEFO deve atuar: ao adicionar um medicamento, a baixa tem de escolher o lote de menor validade. Hoje a baixa é por `Inventory` agregado, sem lote (`backend/src/routes/vendasForaPdv.ts:144-168`).
- O bloqueio de venda acima do PMC precisa de validação por item no momento da venda, antes de totalizar.

## Fonte

`backend/src/routes/vendas.ts:21` e `:32` (e demais trechos citados) — acessado em 2026-10-13
