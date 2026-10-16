# Tasks — Sprint 04

> Um bloco por task. Repita o bloco abaixo para cada task da sprint, preenchendo TODOS os campos — nenhum é opcional. Na execução (F6), a linha `status` é atualizada em cada transição; ao concluir, acrescente data e resultado da suíte.

---

```yaml
id: T-04.01
titulo: Recebimento de compra cria lote
objetivo: "Capturar lote e validade por item no recebimento de compra e persistir o Lote (o contrato do recebimento ainda é NÃO DOCUMENTADO em base/compras.md — leitura integral de compras.ts como primeiro passo)."
arquivos:
  cria: []
  altera: [backend/src/routes/compras.ts]
teste_integracao: Receber uma compra de medicamento com lote e validade cria um Lote com a quantidade recebida.
teste_funcional: Compra de 10 unidades, lote "L1", validade 2027-01-01 gera um Lote com saldo 10 e essa validade.
criterio_aceite: Existe 1 Lote com quantidade 10 e validade 2027-01-01 após o recebimento.
depende_de: [T-02.02]
paralelizavel: false
status: concluida  # 2026-10-13 · suíte: 23 passed (11 arquivos) · typecheck exit 0 · recebimento aceita `lotes: { <itemId>: { lote, validade } }`, acumula quando repete lote+validade, ignora item sem lote e recusa lote sem validade com 400 (nada é recebido) · divergência: criou backend/tests/farmacia-compra-lote.test.ts (arquivos.cria não previa)
```

---

```yaml
id: T-04.02
titulo: Posição de estoque por lote
objetivo: Retornar o saldo por lote, com lote e validade, na consulta de estoque.
arquivos:
  cria: []
  altera: [backend/src/routes/estoque.ts]
teste_integracao: "`GET /api/estoque` lista os saldos por lote com lote e validade."
teste_funcional: Um produto com dois lotes retorna duas linhas, cada uma com seu lote e validade.
criterio_aceite: A resposta traz lote e validade por saldo quando o produto tem lotes.
depende_de: [T-04.01]
paralelizavel: false
status: concluida  # 2026-10-13 · suíte: 23 passed (11 arquivos) · typecheck exit 0 · `GET /api/estoque` traz linha extra por lote (campos lote, validade, quantidade, tipo=LOTE, grade="Lote L1 · val dd/mm/aaaa"), ordenadas por validade (FEFO); a linha do produto (saldo total) continua igual e linhas de lote têm codigo=null para não afetar o mapa de estoque do PDV · divergência: criou backend/tests/farmacia-estoque-lote.test.ts (arquivos.cria não previa)
```
