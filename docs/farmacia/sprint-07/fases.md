# Fases — Sprint 07

> Um bloco por fase. Repita o bloco quantas vezes forem necessárias. O paralelismo declarado aqui é definitivo: a execução nunca decide paralelismo sozinha.

---

## F-07.1 — Motor de import e resolução de PMC

**Objetivo:** criar o importador da planilha CMED e o resolvedor de PMC por Registro MS.

**Tasks que a compõem:** T-07.01, T-07.03

**Critério de saída:** o importador substitui a tabela CMED e o resolvedor devolve o PMC pelo Registro MS.

**Roda em paralelo com:** nenhuma

---

## F-07.2 — Upload admin e bloqueio na venda

**Objetivo:** expor o upload restrito ao admin e aplicar o bloqueio de venda acima do PMC.

**Tasks que a compõem:** T-07.02, T-07.04

**Critério de saída:** não-admin recebe 403 no upload; venda acima do PMC é rejeitada nas duas rotas.

**Roda em paralelo com:** nenhuma
