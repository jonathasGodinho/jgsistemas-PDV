# Modelo de dados (Prisma)

## Contrato de entrada

- Schema Prisma em `backend/prisma/schema.prisma` (PostgreSQL/Supabase). Contém 44 models (contagem conferida no arquivo).
- Núcleo relevante para farmácia:
  - `Company` / `Branch` / `User` — tenant, filial e operador. Venda referencia `companyId`, `branchId`, `userId` (`backend/src/routes/vendasForaPdv.ts:236-239`).
  - `Product` — produto. Campos fiscais existentes: `ncm`, `cest`, `cfop`, `csosn`, `cst`, e PIS/COFINS por `pisCst`, `pisAliq`, `cofinsCst`, `cofinsAliq` (ver `backend/prisma/schema.prisma`). Não há campos de lote, validade, princípio ativo, PMC nem flag de controlado.
  - `ProductVariant` — variação (barcode/sku/salePrice/costPrice) (`backend/src/routes/vendasForaPdv.ts:117-134`).
  - `Inventory` / `InventoryMovement` / `InventoryCount` — posição e movimentação de estoque. `Inventory` guarda `quantity`; `InventoryMovement` guarda `type`, `quantity`, `reason`, `userId` (`backend/src/routes/vendasForaPdv.ts:153-168`). Não há campos de lote/validade.
  - `Sale` / `SaleItem` / `SalePayment` / `SaleInstallment` / `NfeEvent` — venda, itens, pagamento, parcelas e eventos fiscais. `Sale` guarda `nfeStatus`, `nfeNumber`, `nfceNumber`, `nfeSerie`, `nfeKey`, `nfeProtocol`, `nfeEmitidoAt`, `nfeXmlEnviado`, `nfeError`, `nfeXmlRetorno` (`backend/src/nfe/eventos.ts:89-96`, `backend/src/routes/vendasForaPdv.ts:386-391`).
  - `Purchase` / `PurchaseItem` — compras; `PurchaseItem.Product` é incluído no detalhe (`backend/src/routes/compras.ts`).
  - `PriceTable` / `Promotion` — preços/promoções; `resolverPreco` usa `Product.salePrice`/`ProductVariant.salePrice` como base (`backend/src/routes/vendasForaPdv.ts:132-133`).
  - `Customer` / `CreditScore` / `CashbackBalance` — cliente, limite de crédito (`creditLimit`) e cashback (`backend/src/routes/vendasForaPdv.ts:200-231`).
  - `FinancialTransaction` / `CardReceivable` / `CardStatement*` — financeiro; títulos `RECEIVE` por parcela (`backend/src/routes/vendasForaPdv.ts:288-303`).
  - `LoyaltyPoint` — fidelidade/cashback (`backend/src/routes/vendasForaPdv.ts:314-357`).
  - `PlatformSetting` / `SaasCobranca` / `SaasNota` — configuração de plataforma e cobrança SaaS.

## Contrato de saída

- IDs são `String` (UUID gerado com `randomUUID()` na aplicação, ex.: `backend/src/routes/vendasForaPdv.ts:94`, `:235`, `:254`).
- Valores monetários são `Decimal` no Prisma e convertidos para `Number` na aplicação (ex.: `Number(venda.total)`, `backend/src/routes/vendasForaPdv.ts:375`).

## Limites e cotas

- NÃO DOCUMENTADO limites de tamanho de campos no schema (dependem do tipo Prisma de cada coluna).

## Erros conhecidos e tratamento

- NÃO DOCUMENTADO.

## Riscos para a nossa implementação

- Adicionar lote/validade exige nova entidade (ex.: lote por produto+filial+validade) e ajuste em `InventoryMovement` para amarrar o lote movimentado — hoje a baixa é por `Inventory` agregado (`backend/src/routes/vendasForaPdv.ts:144-168`), sem rastreio de qual lote saiu.
- Princípio ativo/tipo de medicamento e PMC não existem como colunas; serão campos novos em `Product` ou tabela auxiliar.
- `ProductVariant` não guarda estoque próprio; `Inventory` referencia `variantId` opcional (`backend/src/routes/vendasForaPdv.ts:136-142`) — decisão de modelar lote na variante vs. produto precisa ser resolvida na descoberta.

## Fonte

`backend/prisma/schema.prisma`, `backend/src/routes/vendasForaPdv.ts` (linhas citadas), `backend/src/nfe/eventos.ts:89-96` — acessado em 2026-10-13
