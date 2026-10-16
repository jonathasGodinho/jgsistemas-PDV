# Fases — Sprint 01

> Um bloco por fase. Repita o bloco quantas vezes forem necessárias. O paralelismo declarado aqui é definitivo: a execução nunca decide paralelismo sozinha.

---

## F-01.1 — Runner e comando de teste

**Objetivo:** instalar e configurar o runner de testes do backend e expor o comando `test`.

**Tasks que a compõem:** T-01.01

**Critério de saída:** `npm test` no backend executa a suíte e sai com exit code 0.

**Roda em paralelo com:** nenhuma

---

## F-01.2 — Ambiente de teste e fixtures

**Objetivo:** prover banco de teste isolado, setup de execução e factories de fixture.

**Tasks que a compõem:** T-01.02, T-01.03, T-01.04

**Critério de saída:** existe 1 teste smoke verde que usa uma factory persistida no banco de teste.

**Roda em paralelo com:** nenhuma

---

## F-01.3 — Cliente HTTP de teste

**Objetivo:** permitir que os testes chamem endpoints do app Express sem subir uma porta, com helper de autenticação.

**Tasks que a compõem:** T-01.05

**Critério de saída:** um teste faz requisição HTTP autenticada ao app importado e recebe 200.

**Roda em paralelo com:** nenhuma
