# Tasks — Sprint 01

> Um bloco por task. Repita o bloco abaixo para cada task da sprint, preenchendo TODOS os campos — nenhum é opcional. Na execução (F6), a linha `status` é atualizada em cada transição; ao concluir, acrescente data e resultado da suíte.

---

```yaml
id: T-01.01
titulo: Instalar e configurar o runner de testes
objetivo: Adicionar vitest ao backend e expor o comando `test` no package.json.
arquivos:
  cria: [backend/vitest.config.ts]
  altera: [backend/package.json]
teste_integracao: Rodar `npm test` no backend executa a suíte e retorna exit code 0.
teste_funcional: Um teste trivial `expect(1 + 1).toBe(2)` passa sob o comando `test`.
criterio_aceite: "`npm test` no backend retorna exit code 0 e reporta 1 passing."
depende_de: []
paralelizavel: false
status: concluida  # 2026-10-13 · suíte: 1 passed, 0 failed```

---

```yaml
id: T-01.02
titulo: Ambiente de teste com banco isolado
objetivo: Configurar variáveis de ambiente de teste e setup que prepara o banco antes da suíte.
arquivos:
  cria: [backend/.env.test, backend/tests/setup.ts]
  altera: []
teste_integracao: O setup carrega `DATABASE_URL` de teste e aplica as migrações Prisma antes da suíte.
teste_funcional: Um teste que cria e lê um Company no banco de teste passa.
criterio_aceite: A suíte cria e lê um Company de teste sem tocar o banco de produção.
depende_de: [T-01.01]
paralelizavel: false
status: concluida  # 2026-10-13 · suíte: 3 passed, 0 failed
```

---

```yaml
id: T-01.03
titulo: Factories de fixture (company, branch, user, product) e fixture CMED
objetivo: Criar factories que produzem registros válidos de company, branch, user e product no banco de teste, e uma fixture CSV da CMED conforme o formato D-18.
arquivos:
  cria: [backend/tests/factories.ts, backend/tests/fixtures/cmed.csv]
  altera: []
teste_integracao: A factory cria Company, Branch, User e Product persistidos e relacionados no banco de teste.
teste_funcional: Chamar `criarProduto()` retorna um Product persistido com id; a fixture `cmed.csv` tem as colunas `registroMS,descricao,pmc`.
criterio_aceite: As quatro factories retornam registros persistidos com id não vazio e a fixture CMED existe no formato D-18.
depende_de: [T-01.02]
paralelizavel: false
status: concluida  # 2026-10-13 · suíte: 5 passed, 0 failed
```

---

```yaml
id: T-01.04
titulo: Documentar o harness e adicionar teste smoke
objetivo: Documentar como rodar e adicionar testes, e deixar um teste smoke verde de referência.
arquivos:
  cria: [docs/farmacia/harness-testes-como-usar.md]
  altera: []
teste_integracao: O documento descreve o comando de teste e o passo para criar um novo teste.
teste_funcional: Existe 1 teste smoke que usa uma factory e passa sob `npm test`.
criterio_aceite: "`npm test` reporta o teste smoke passando e o documento existe."
depende_de: [T-01.03]
paralelizavel: false
status: concluida  # 2026-10-13 · suíte: 6 passed, 0 failed
```

---

```yaml
id: T-01.05
titulo: App exportável e cliente HTTP de teste
objetivo: Extrair o app Express para um módulo importável (sem `listen`) e prover um cliente HTTP de teste com helper de autenticação.
arquivos:
  cria: [backend/src/app.ts, backend/tests/http.ts]
  altera: [backend/src/server.ts, backend/package.json]
teste_integracao: Um teste importa o app sem abrir porta e faz `GET /robots.txt` recebendo 200.
teste_funcional: Um teste autenticado (sessão criada pela factory) acessa uma rota protegida por `autenticar` e recebe 200.
criterio_aceite: O app é importável sem `app.listen` e um teste HTTP autenticado recebe 200.
depende_de: [T-01.04]
paralelizavel: false
status: concluida  # 2026-10-13 · suíte: 8 passed, 0 failed · typecheck exit 0
```
