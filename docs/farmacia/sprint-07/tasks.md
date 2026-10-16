# Tasks — Sprint 07

> Um bloco por task. Repita o bloco abaixo para cada task da sprint, preenchendo TODOS os campos — nenhum é opcional. Na execução (F6), a linha `status` é atualizada em cada transição; ao concluir, acrescente data e resultado da suíte.

---

```yaml
id: T-07.01
titulo: Importador da planilha CMED
objetivo: "Ler o CSV CMED (colunas `registroMS`, `descricao`, `pmc` — D-18) e substituir a tabela CmedPreco pelas linhas válidas do arquivo."
arquivos:
  cria: [backend/src/utils/cmed.ts]
  altera: []
teste_integracao: O importador processa o CSV de fixture e grava um CmedPreco por linha com registroMS e pmc numérico.
teste_funcional: Importar a fixture (2 linhas válidas) deixa a tabela com 2 registros; reimportar com 1 linha deixa com 1.
criterio_aceite: Após o import, a tabela CmedPreco tem exatamente as linhas válidas do arquivo (D-18).
depende_de: [T-02.02, T-01.03]
paralelizavel: false
status: concluida  # 2026-10-14 — backend/src/utils/cmed.ts (parseCmed + importarCmed) · suíte: 14 passed (4 arquivos) · suíte completa: 19 files / 47 passed · typecheck exit 0 · divergência: a fixture tests/fixtures/cmed.csv tem 3 linhas válidas, não 2 — o teste de integração usa a fixture real (espera 3) e o funcional usa CSV inline (2 → 2; reimport 1 → 1), como no enunciado; tests/farmacia-cmed-import.test.ts criado (não listado em arquivos.cria); o RED expôs um bug: linha com pmc vazio era lida como 0 — agora exige pmcTexto não vazio
```

---

```yaml
id: T-07.02
titulo: Endpoint admin de upload da CMED
objetivo: Expor o upload da planilha CMED restrito ao admin, usando o importador.
arquivos:
  cria: []
  altera: [backend/src/routes/farmacia.ts]
teste_integracao: "`POST /api/farmacia/cmed` com arquivo atualiza a tabela CmedPreco."
teste_funcional: Usuário não-admin recebe 403; admin recebe 200 e a tabela é substituída.
criterio_aceite: Não-admin recebe 403; admin recebe 200 e a tabela CmedPreco passa a refletir o arquivo.
depende_de: [T-07.01, T-02.03]
paralelizavel: true
status: concluida  # 2026-10-14 — POST /api/farmacia/cmed em backend/src/routes/farmacia.ts (requerPermissao('ADMIN'), 403 não-admin, 400 sem CSV, 200 { importados }) · suíte: 14 passed (4 arquivos) · typecheck exit 0 · divergência: o upload recebe o conteúdo CSV no corpo JSON `{ csv: "..." }` em vez de multipart/multer, para não adicionar dependência nova; nenhum frontend estava previsto na task; tests/farmacia-cmed-upload.test.ts criado
```

---

```yaml
id: T-07.03
titulo: Resolvedor de PMC por Registro MS
objetivo: Criar a função que devolve o PMC vigente de um produto pelo Registro MS, ou vazio quando não há.
arquivos:
  cria: [backend/src/utils/pmc.ts]
  altera: []
teste_integracao: A função retorna o PMC da tabela CMED para um Registro MS existente.
teste_funcional: Registro MS presente na CMED retorna o PMC; ausente retorna vazio.
criterio_aceite: Para o Registro MS da fixture o resultado é o valor `pmc` exato da linha; para um Registro MS ausente, o resultado é vazio.
depende_de: [T-07.01]
paralelizavel: false
status: concluida  # 2026-10-14 — backend/src/utils/pmc.ts (resolverPmc por Registro MS + pmcDoProduto) · suíte: 14 passed (4 arquivos) · typecheck exit 0 · divergência: além de resolverPmc (D-11), foi criado pmcDoProduto, que cai no Product.pmc quando não há linha na CMED (D-08 "produto tem PMC cadastrado"); cobertura multiempresa incluída (PMC de uma empresa não vaza para outra); tests/farmacia-pmc.test.ts criado
```

---

```yaml
id: T-07.04
titulo: Bloqueio de venda acima do PMC
objetivo: Aplicar o bloqueio por PMC nas rotas de venda do PDV e fora do PDV, apenas quando há PMC.
arquivos:
  cria: []
  altera: [backend/src/routes/vendas.ts, backend/src/routes/vendasForaPdv.ts]
teste_integracao: As duas rotas rejeitam um item cujo preço excede o PMC do Registro MS.
teste_funcional: Venda de item acima do PMC resulta em erro 400 nas duas rotas; produto sem PMC conclui a venda.
criterio_aceite: As duas rotas retornam erro quando o preço excede o PMC e concluem quando não há PMC.
depende_de: [T-07.03, T-05.02, T-05.03]
paralelizavel: true
status: concluida  # 2026-10-14 — bloqueio em backend/src/routes/vendas.ts (:127) e backend/src/routes/vendasForaPdv.ts (:137), imediatamente após resolverPreco e antes de qualquer escrita · suíte: 14 passed (4 arquivos) · typecheck exit 0 · divergência: (1) o bloqueio NÃO é gateado por moduloAtivo('farmacia') — só depende de o produto ter PMC, conforme base/precos.md (bloqueio independente do gating de preços); o teste "o bloqueio não depende do módulo de preços liberado" prova isso com JG_MODULOS sem 'precos'; (2) pmcDoProduto lê a CMED pelo cliente raiz (fora da transação), mas antes de qualquer persistência, então a venda bloqueada não grava nada; (3) tolerância de float 1e-9 para "preço igual ao PMC" não bloquear
```
