# Tasks — Sprint 02

> Um bloco por task. Repita o bloco abaixo para cada task da sprint, preenchendo TODOS os campos — nenhum é opcional. Na execução (F6), a linha `status` é atualizada em cada transição; ao concluir, acrescente data e resultado da suíte.

---

```yaml
id: T-02.01
titulo: Modelo Prisma de farmácia
objetivo: Adicionar campos de farmácia ao Product (princípio ativo, tipo, Registro MS, PMC) e as entidades Lote e CmedPreco.
arquivos:
  cria: []
  altera: [backend/prisma/schema.prisma]
teste_integracao: "`npx prisma validate` passa com os novos models e relations."
teste_funcional: Criar Product com principioAtivo e registroMS, mais um Lote e um CmedPreco, e ler de volta no banco de teste.
criterio_aceite: "`npx prisma validate` sai 0 e os três models persistem e lêem no banco de teste."
depende_de: [T-01.03]
paralelizavel: false
status: concluida  # 2026-10-13 · suíte: 2 passed · prisma validate exit 0 · divergência: também alterou backend/src/db.ts (registra Lote/CmedPreco no isolamento multiempresa; arquivos.altera não previa)
```

---

```yaml
id: T-02.02
titulo: Migração da modelagem farmácia
objetivo: Gerar e aplicar a migração Prisma da nova modelagem (não há seed.ts no repositório).
arquivos:
  cria: [backend/prisma/migrations (novo arquivo de migração)]
  altera: []
teste_integracao: "`prisma migrate dev` aplica sem erro no banco de teste."
teste_funcional: Após a migração, a tabela de lote existe e aceita um registro.
criterio_aceite: A migração aplica com exit 0 e a tabela de lote existe no banco de teste.
depende_de: [T-02.01]
paralelizavel: false
status: concluida  # 2026-10-13 · migração 20261013204347_farmacia_lote_cmed aplicada (exit 0) · suíte: 10 passed · nota: primeira migração do projeto (baseline do schema completo, inclui Lote/CmedPreco)
```

---

```yaml
id: T-02.03
titulo: Módulo farmácia e router /api/farmacia
objetivo: Registrar a chave `farmacia` no catálogo e criar/registrar o router com um endpoint de status.
arquivos:
  cria: [backend/src/routes/farmacia.ts]
  altera: [backend/modulos.json, backend/src/app.ts]
teste_integracao: "`GET /api/farmacia/status` responde 200 e `moduloAtivo('farmacia')` reflete a liberação do tenant."
teste_funcional: Com o módulo desligado, o status indica inativo; ligado, indica ativo.
criterio_aceite: "`GET /api/farmacia/status` responde 200 e `moduloAtivo('farmacia')` muda conforme a liberação."
depende_de: [T-02.01]
paralelizavel: false
status: concluida  # 2026-10-13 · suíte: 14 passed · typecheck exit 0 · divergência: módulo no catálogo com `apis: []` para o status responder mesmo desligado (informando ativo:false); gating fica por `moduloAtivo`/contrato
```
