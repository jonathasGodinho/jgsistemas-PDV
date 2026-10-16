# Fases — Sprint 05

> Um bloco por fase. Repita o bloco quantas vezes forem necessárias. O paralelismo declarado aqui é definitivo: a execução nunca decide paralelismo sozinha.

---

## F-05.1 — Serviço FEFO

**Objetivo:** criar o serviço que seleciona e consome lotes por ordem de validade, com fallback quando não há lote.

**Tasks que a compõem:** T-05.01, T-05.04

**Critério de saída:** o serviço retorna os lotes em ordem de validade crescente, respeita a quantidade e retorna vazio para produto sem lote.

**Roda em paralelo com:** nenhuma

---

## F-05.2 — FEFO aplicado nas vendas

**Objetivo:** usar o serviço FEFO nas rotas de venda do PDV e fora do PDV.

**Tasks que a compõem:** T-05.02, T-05.03

**Critério de saída:** após a venda, o lote de menor validade teve o saldo reduzido, nas duas rotas.

**Roda em paralelo com:** nenhuma
