# Fluxos de venda, compra e estoque que movimentam medicamento

## Contrato de entrada

Rotas que movimentam estoque/lote (todas no backend Express, `backend/src/routes/`):

| Movimento | Rota | Arquivo:linha | Lote (D-20) |
|---|---|---|---|
| Venda PDV | `POST /api/vendas` (`itens[{codigo,quantidade}]`, `pagamento`, `orcamento`, `clienteId`, `naoEmitirNfe`) | `vendas.ts:65` | FEFO + `LoteMovimento VENDA` |
| Efetivar orçamento | `POST /api/vendas/:id/efetivar` | `vendas.ts:445` | FEFO + VENDA |
| Cancelar venda (só do dia, senha admin) | `POST /api/vendas/:id/cancelar` | `vendas.ts:719` | estorno exato (CANCELAMENTO) |
| Troca/devolução (senha admin) | `POST /api/trocas` | `trocas.ts:28` | DEVOLUCAO + FEFO nos itens novos |
| Venda a prazo (crediário) | `POST /api/vendas-fora-pdv` | `vendasForaPdv.ts:45` | FEFO + VENDA |
| Receber compra | `POST /api/compras/:id/receber` (`lotes{itemId:{lote,validade}}`) | `compras.ts:137` | `ENTRADA_COMPRA` |
| Entrada/saída/ajuste manual | `POST /api/estoque/entrada|saida|ajuste` | `estoque.ts:165,224,287` | ENTRADA_MANUAL / SAIDA_MANUAL / AJUSTE |
| Conciliação de lotes | `GET/POST /api/farmacia/lotes/conciliacao|conciliar` | `farmacia.ts:159,170` | CONCILIACAO |

Serviço de lote: `backend/src/utils/fefo.ts` — `baixarLotesFefo` (158), `validarEstoqueVendavel` (180), `estornarLotesDaVenda` (216), `entradaEmLote` (267), `saidaDeLote` (294), `ajustarLotesAoEstoque` (320).

Frontend: `frontend/pdv.html` (1633 linhas) envia a venda em `fetch('/api/vendas')` nas linhas 1333 e 1410; `frontend/vendas-fora-pdv.html` (1105 linhas); `frontend/compras.html` (367 linhas); `frontend/estoque.html`; `frontend/produto.html` (484 linhas, aba Farmácia).

## Contrato de saída

- Venda: `201` com `numero`, `total`, `troco`, `pagamento`, `nfe` (`vendas.ts`, fim do `POST /`); erro `400 { erro }` (qualquer `throw` dentro da transação vira 400).
- Cancelamento: `200 { ok, status: 'CANCELLED' }`.

## Limites e cotas

- Cancelamento só de vendas do dia (`vendas.ts`, bloco "Somente vendas do dia podem ser canceladas").
- Transações Prisma com `maxWait 10s` e `timeout 30s` (`backend/src/db.ts:6-8`).

## Erros conhecidos e tratamento

- Venda que só sairia de lote vencido é bloqueada (`validarEstoqueVendavel`, D-20).
- Venda de produto sem lote segue pelo saldo agregado (D-09).

## Riscos para a nossa implementação

- O PDV hoje não pede dados de receita: a captura precisa entrar no fluxo de finalização do `pdv.html` (linhas 1333/1410) e de `vendas-fora-pdv.html`, sem atrasar vendas comuns.
- Cancelamento e devolução de venda controlada precisam aparecer no SNGPC: o padrão XML não tem operação "estorno de venda" (só entrada, venda, transferência, perda — `sngpc-padrao-xml.md`); como escriturar cancelamento/devolução é NÃO DOCUMENTADO na fonte.
- Saída manual e ajuste de controlado precisam virar `saidaMedicamentoPerda` com motivo SNGPC; hoje o motivo é texto livre (`estoque.ts:224,287`).
- Venda de controlado sem lote não pode ser escriturada (o XML exige lote).

## Fonte

- `backend/src/routes/vendas.ts:65,445,719`; `trocas.ts:28`; `vendasForaPdv.ts:45`; `compras.ts:137`; `estoque.ts:165,224,287`; `farmacia.ts:159,170` — acessado em 2026-10-16
- `backend/src/utils/fefo.ts:158-320` — acessado em 2026-10-16
- `frontend/pdv.html:1333,1410` — acessado em 2026-10-16
- `docs/farmacia/00-DECISOES.md` (D-09, D-17, D-20, D-21) — acessado em 2026-10-16
