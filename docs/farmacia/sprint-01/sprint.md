# Sprint 01 — Capacidade de testar (harness)

## Objetivo

Entregar a infraestrutura de teste do backend — runner, ambiente de banco de teste, fixtures e comando — sem nenhuma funcionalidade de negócio. É pré-requisito executável para o TDD das sprints seguintes (D-04; `base/harness-testes.md`).

## Fases

| Fase | Título | Roda em paralelo com |
|---|---|---|
| F-01.1 | Runner e comando de teste | nenhuma |
| F-01.2 | Ambiente de teste e fixtures | nenhuma |
| F-01.3 | Cliente HTTP de teste | nenhuma |

Detalhe de cada fase em `fases.md`; tasks em `tasks.md`.

## Critério de saída

`npm test` no backend retorna exit code 0 e reporta 1 teste smoke passando, com as factories de fixture disponíveis e um teste HTTP autenticado funcionando contra o app importado (sem abrir porta).

## Riscos conhecidos

- Não existe nenhuma infraestrutura de teste hoje (`docs/farmacia/base/harness-testes.md`) — esta sprint existe para eliminá-lo.
- O runner (vitest) é uma escolha de plano registrada em D-15; se a execução optar por Jest, a config deve ser ajustada sem mudar os testes.
- O banco de teste é um Postgres provisionado à parte, isolado da produção (Supabase) — D-16.
- O app Express hoje sobe servidor ao ser importado (`backend/src/server.ts`); a F-01.3 extrai o `app` para um módulo exportável sem `listen`.
