# Tasks — Sprint 05

> Um bloco por task. Repita o bloco abaixo para cada task da sprint, preenchendo TODOS os campos — nenhum é opcional. Na execução (F6), a linha `status` é atualizada em cada transição; ao concluir, acrescente data e resultado da suíte.

---

```yaml
id: T-05.01
titulo: Serviço de seleção FEFO
objetivo: Criar a função que consome lotes de um produto/filial em ordem de validade crescente e devolve os lotes usados.
arquivos:
  cria: [backend/src/utils/fefo.ts]
  altera: []
teste_integracao: "`selecionarLotes(produtoId, filialId, qtd)` consome do lote de menor validade antes dos demais."
teste_funcional: Com dois lotes (venc 2026-12 e 2027-12) e uma venda de 5, o lote de 2026-12 é consumido primeiro.
criterio_aceite: A função retorna os lotes em ordem de validade crescente e respeita a quantidade solicitada.
depende_de: [T-04.02]
paralelizavel: false
status: concluida  # 2026-10-13 — `backend/src/utils/fefo.ts` com `lotesDisponiveis`/`selecionarLotes`/`baixarLotesFefo` (greedy por validade asc, filtra quantidade>0 e validade>=hoje pois D-17, arredonda 3 casas) · suíte: 31 passed (14 arquivos) · typecheck exit 0 · divergência: criou backend/tests/farmacia-fefo.test.ts (arquivos.cria não previa)
```

---

```yaml
id: T-05.02
titulo: FEFO na venda do PDV
objetivo: Usar o serviço FEFO na rota de venda do PDV e registrar o movimento por lote.
arquivos:
  cria: []
  altera: [backend/src/routes/vendas.ts]
teste_integracao: Uma venda no PDV de medicamento com lotes baixa do lote mais antigo e registra movimento por lote.
teste_funcional: Vender 3 unidades reduz em 3 o saldo do lote de menor validade.
criterio_aceite: Após a venda, o lote de menor validade teve o saldo reduzido em 3.
depende_de: [T-05.01]
paralelizavel: true
status: concluida  # 2026-10-13 — POST /api/vendas e POST /api/vendas/:id/efetivar chamam `baixarLotesFefo` dentro do $transaction e gravam um InventoryMovement por lote ("Venda PDV · Lote X (val dd/mm/aaaa)"); produto com variante é ignorado (Lote não tem variantId) · suíte: 31 passed (14 arquivos) · typecheck exit 0 · divergência: criou backend/tests/farmacia-fefo-venda-pdv.test.ts (arquivos.cria não previa)
```

---

```yaml
id: T-05.03
titulo: FEFO na venda fora do PDV
objetivo: Usar o serviço FEFO na rota de venda a prazo/crediário.
arquivos:
  cria: []
  altera: [backend/src/routes/vendasForaPdv.ts]
teste_integracao: Uma venda a prazo consome lotes na ordem de validade (FEFO).
teste_funcional: Vender 3 unidades a prazo reduz em 3 o saldo do lote de menor validade.
criterio_aceite: Após a venda a prazo, o lote de menor validade teve o saldo reduzido em 3.
depende_de: [T-05.01]
paralelizavel: true
status: concluida  # 2026-10-13 — POST /api/vendas-fora-pdv usa `baixarLotesFefo` dentro do $transaction e grava movimento por lote ("Venda a prazo · Lote X (val dd/mm/aaaa)") · suíte: 31 passed (14 arquivos) · typecheck exit 0 · divergência: criou backend/tests/farmacia-venda-fora-pdv-fefo.test.ts (arquivos.cria não previa)
```

---

```yaml
id: T-05.04
titulo: Fallback de produto sem lote
objetivo: Garantir que produto sem lote vende normalmente, sem FEFO e sem erro.
arquivos:
  cria: []
  altera: [backend/src/utils/fefo.ts]
teste_integracao: Produto sem lotes faz o FEFO retornar vazio e a venda seguir pelo saldo agregado.
teste_funcional: Vender um produto sem lote conclui a venda sem erro.
criterio_aceite: A venda de um produto sem lote conclui com sucesso.
depende_de: [T-05.01]
paralelizavel: true
status: concluida  # 2026-10-13 — `selecionarLotes`/`baixarLotesFefo` devolvem [] quando o produto não tem lote e a venda segue pelo saldo agregado; teste de venda real sem lote (PDV) confirma 201 e baixa do Inventory · suíte: 31 passed (14 arquivos) · typecheck exit 0 · divergência: `formatarValidade` exportada de fefo.ts e reusada por estoque.ts/vendas.ts/vendasForaPdv.ts; backend/src/routes/estoque.ts (arquivo de T-04.02) voltou a ser tocado (troca do formatador local pelo compartilhado)
```
