# Modelo de dados atual (Prisma) — o que a feature reaproveita e o que falta

## Contrato de entrada

Modelos lidos em `backend/prisma/schema.prisma`:

- `Product` (linha 468): `registroMS`, `principioAtivo`, `tipoMedicamento`, `pmc`, `mvaSt`, `reducaoSt` (Fase 1); `unit String @default("UN")`; sem campo de lista da Portaria 344 nem classe terapêutica SNGPC. Validação dos campos de farmácia em `backend/src/routes/produtos.ts:38-47`.
- `Lote` (linha 911): `companyId`, `branchId`, `productId`, `lote`, `validade`, `quantidade Decimal(10,3)`.
- `LoteMovimento` (linha 933): livro-razão do lote (D-20 da Fase 1) — `tipo` (VENDA, CANCELAMENTO, DEVOLUCAO, ENTRADA_COMPRA, ENTRADA_MANUAL, SAIDA_MANUAL, AJUSTE, CONCILIACAO, SALDO_INICIAL), `quantidade` com sinal, `saleId`, `saleItemId`, `origemId`, `referencia`, `userId`, `createdAt`.
- `Sale` (linha 561): `customerId?`, `userId`, `status`, `nfceNumber`, campos NFC-e; sem dados de receita.
- `SaleItem` (linha 623): `productId`, `variantId?`, `quantity Int`, preços; sem dados de receita.
- `Customer` (linha 308): `name`, `document?` (texto único), `birthDate?`, `gender?`, endereço; sem tipo de documento, órgão expedidor ou UF do documento.
- `Company` (linha 133): `document` (CNPJ, `@unique`), `cnae?`, endereço.
- `Branch` (linha 24): `document?` (CNPJ da filial), endereço.
- `User` (linha 776): `role UserRole`; sem CPF; sem número de CRF.
- `UserRole` (linha 857): ADMIN, MANAGER, SUPERVISOR, SELLER, STOCKIST, FINANCIAL — não há farmacêutico/RT.
- `Purchase` (linha 533): `supplierId?`, `orderNumber?`, `status`, `total`; sem número/data/chave de NF de entrada.
- `PurchaseItem` (linha 550): `productId`, `quantity Int`, `unitCost`.
- `Supplier` (linha 669): `document?` (CNPJ).
- `Inventory.quantity Int` (linha 412) e `InventoryMovement.quantity Int` (linha 429).

Multiempresa: modelos com `companyId` direto ficam no conjunto `DIRETAS` de `backend/src/db.ts:15-19` (inclui `Lote`, `LoteMovimento`, `CmedPreco`); modelo novo com `companyId` precisa entrar ali.

Migrações versionadas em `backend/prisma/migrations/` (a mais recente: `20261016120000_farmacia_lote_movimento`).

## Contrato de saída

NÃO DOCUMENTADO (área de dados, sem saída própria).

## Limites e cotas

- Quantidades de estoque e de venda são inteiras (`Int`) — `schema.prisma:412,429,554` e `SaleItem.quantity Int`.
- `Lote.quantidade` é `Decimal(10,3)` (`schema.prisma:911-926`).

## Erros conhecidos e tratamento

- Modelo com `companyId` fora de `DIRETAS` não é filtrado por empresa (vazamento entre empresas) — `backend/src/db.ts:76-100`.

## Riscos para a nossa implementação

- Faltam, para o SNGPC: classe terapêutica/lista da Portaria 344 no produto; unidade SNGPC (caixa/frasco); dados da receita por venda (tipo, número, data, prescritor, conselho, UF, uso); comprador com tipo/órgão/UF do documento; paciente (nome, idade, sexo) para antimicrobiano; NF de entrada (número, data, CNPJ origem/destino); CPF do RT; papel de farmacêutico.
- `LoteMovimento` já registra toda movimentação de lote com venda/item — é a fonte natural das movimentações do XML, desde que o medicamento controlado seja obrigatoriamente vendido com lote (hoje produto sem lote vende sem lote, D-09 da Fase 1).
- Venda de variante (`variantId`) não usa lote (`backend/src/routes/vendas.ts`, baixa FEFO só para `!variante`).

## Fonte

- `backend/prisma/schema.prisma` (linhas citadas) — acessado em 2026-10-16
- `backend/src/db.ts:15-19,76-100` — acessado em 2026-10-16
- `backend/src/routes/produtos.ts:38-47` — acessado em 2026-10-16
- `docs/farmacia/00-DECISOES.md` (D-09, D-20) — acessado em 2026-10-16
