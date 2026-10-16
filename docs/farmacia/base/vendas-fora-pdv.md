# Vendas fora do PDV (crediário)

## Contrato de entrada

- Rotas em `backend/src/routes/vendasForaPdv.ts` (554 linhas). Requer autenticação (`router.use(autenticar)`, `:16`).
- `POST /api/vendas-fora-pdv` (`:43`): corpo `{ cliente, celular, itens[], parcelas, primeiraVencimento, desconto, senhaAdmin, observacoes, clienteId?, cashbackResgate? }` (`:44`).
  - `parcelas` é coagido a inteiro entre 1 e 24 (`:52`).
  - `primeiraVencimento` no formato `YYYY-MM-DD` (`:53`).
  - Cada item: `{ codigo, quantidade }`; produto resolvido por `barcode` ou `sku` em `ProductVariant` e depois `Product` (`:114-130`).
- `POST /api/vendas-fora-pdv/:id/parcela/:parcelaId/baixar` (`:495`) — baixa de parcela.

## Contrato de saída

- `POST /` retorna `{ id, numero, total, subtotal, desconto, parcelas, cliente, data, nfe }`; `nfe` é `null` ou o objeto serializado de `serializarNfe` (`:18-29`, `:372-400`).
- `GET /` lista até 100 vendas de crediário com status `QUITADO`/`EM ATRASO`/`EM ABERTO` (`:407-442`).
- `GET /:id` detalhe com itens e parcelas (`:445-492`).

## Limites e cotas

- Parcelas: mínimo 1, máximo 24 (`:52`).
- Listagem: `take: 100` (`:414`).
- Limite de crédito do cliente: `creditLimit > 0` limita o saldo em aberto; bloqueio condicionado ao setting `bloquear_crediario_limite` (default `true`) (`:200-217`).
- Cashback: resgate limitado ao `balance` do cliente (`:221-231`).
- Códigos de status HTTP: 400 (erro de negócio), 403 (operador sem permissão), 404 (não encontrado), 201 (criado).

## Erros conhecidos e tratamento

- `"Informe o nome do cliente!"`, `"Nenhum item informado!"`, `"Informe a data da primeira parcela!"` (`:46-56`).
- `"Empresa, filial ou operador não configurados no sistema!"` (`:73-75`).
- `"Produto não encontrado: <codigo>"` (`:128-130`); `"Estoque insuficiente para: <produto>"` (`:144-146`).
- `"Valor total da venda deve ser maior que zero!"` (`:182-184` e `:195-197`).
- `"Limite de crédito excedido para <cliente>! Excedente: R$ ..."` (`:211-215`).
- `"Saldo de cashback insuficiente! Disponível: R$ ..."` (`:228-230`).
- Desconto: `autorizarDesconto(descontoNum, senhaAdmin)` retorna erro se não autorizado (`:61-64`).

## Riscos para a nossa implementação

- Venda a prazo de medicamento controlado precisa respeitar as regras de controlados (Fase 2) — hoje não há validação de controlado.
- Baixa de estoque aqui é agregada, sem lote/FEFO (`:136-168`); replicar a lógica de lote nas duas rotas de venda (PDV e fora do PDV).
- Emissão de NFC-e após criar a venda (`:382-399`) — a checagem de PMC/bloqueio deve ocorrer **antes** de persistir, não na emissão.

## Fonte

`backend/src/routes/vendasForaPdv.ts` (linhas citadas) — acessado em 2026-10-13
