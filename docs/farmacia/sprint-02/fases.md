# Fases — Sprint 02

> Um bloco por fase. Repita o bloco quantas vezes forem necessárias. O paralelismo declarado aqui é definitivo: a execução nunca decide paralelismo sozinha.

---

## F-02.1 — Modelo de dados e migração

**Objetivo:** adicionar os campos e entidades de farmácia ao schema Prisma e gerar a migração.

**Tasks que a compõem:** T-02.01, T-02.02

**Critério de saída:** `npx prisma validate` sai 0 e a migração aplica no banco de teste criando a tabela de lote.

**Roda em paralelo com:** F-02.2

---

## F-02.2 — Módulo farmácia (gating + router)

**Objetivo:** registrar a chave `farmacia` no catálogo de módulos e criar o router `/api/farmacia` no servidor.

**Tasks que a compõem:** T-02.03

**Critério de saída:** `GET /api/farmacia/status` responde 200 e `moduloAtivo('farmacia')` retorna conforme a liberação do tenant.

**Roda em paralelo com:** F-02.1
