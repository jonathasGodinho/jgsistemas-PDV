# Preços e resolução de preço

## Contrato de entrada

- `backend/src/utils/preco.ts`:
  - `precoBaseDe` (`:4`) — deriva o preço base do produto/variante.
  - `resolverPreco(produtoId, variantId, clienteId, quantidade, precoBase)` (`:9`) — aplica tabelas/promoções conforme cliente/quantidade; **gated** por `moduloAtivo('precos')` (`backend/src/utils/preco.ts`).
- Chamada típica: `resolverPreco(produto.id, variante?.id ?? null, clienteCadastrado.id, qtd, precoBase) ?? precoBase` (`backend/src/routes/vendasForaPdv.ts:133`).

## Contrato de saída

- Retorna o preço unitário resolvido, ou `null`/`undefined` quando nenhuma regra aplica (o chamador cai no `precoBase`).

## Limites e cotas

- NÃO DOCUMENTADO.

## Erros conhecidos e tratamento

- NÃO DOCUMENTADO.

## Riscos para a nossa implementação

- PMC (preço máximo ao consumidor) é um **teto legal**, não uma tabela de desconto. Deve ser validado como bloqueio após `resolverPreco`, não como regra de preço.
- `resolverPreco` só atua quando o módulo `precos` está ativo; o bloqueio de PMC precisa funcionar independentemente do gating de `precos`.

## Fonte

`backend/src/utils/preco.ts:4` e `:9`, `backend/src/routes/vendasForaPdv.ts:133` — acessado em 2026-10-13
