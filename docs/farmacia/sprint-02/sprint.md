# Sprint 02 — Fundação de dados e módulo farmácia

## Objetivo

Modelar lote/validade e os campos de farmácia no banco (D-03, D-10, D-11), aplicar a migração, e transformar farmácia em módulo SaaS com gating (D-02), criando o router `/api/farmacia` registrado no servidor.

## Fases

| Fase | Título | Roda em paralelo com |
|---|---|---|
| F-02.1 | Modelo de dados e migração | F-02.2 |
| F-02.2 | Módulo farmácia (gating + router) | F-02.1 |

Detalhe de cada fase em `fases.md`; tasks em `tasks.md`.

## Critério de saída

`npx prisma validate` passa, a migração aplica no banco de teste, e `GET /api/farmacia/status` responde 200 com `moduloAtivo('farmacia')` seguindo a liberação do tenant.

## Riscos conhecidos

- `Product` hoje só tem fiscais em texto livre e não tem lote/PMC (`docs/farmacia/base/modelo-dados.md`) — os novos campos precisam ser aditivos (nullable) para não quebrar dados existentes.
- `backend/src/server.ts` tem muitos routers e middlewares globais (`base/arquitetura-servidor.md`) — o registro do novo router precisa respeitar o prefixo `/api` e a autenticação.
- O gating vive em `backend/modulos.json` com cache por mtime (`base/modulos-gating.md`) — validar que a nova chave é lida após a alteração do arquivo.
