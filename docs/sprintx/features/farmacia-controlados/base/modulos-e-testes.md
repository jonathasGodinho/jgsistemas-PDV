# Gating de módulo, harness de testes e verificação de tela

## Contrato de entrada

- Catálogo de módulos em `backend/modulos.json` (chave `farmacia` na linha 108, com `apis: []`), lido por `backend/src/utils/modulos.ts`. Sem `JG_MODULOS_ARQUIVO` (dev local) tudo fica liberado (`modulos.ts`, cabeçalho). Rotas `/api/farmacia` montadas em `backend/src/app.ts:122` com `autenticar`.
- No frontend, `JG.moduloOk('farmacia')` e o evento `jg:modulos` (`frontend/ui/shell.js`, `carregarModulos`; B-04 da Fase 1 corrigido).
- Testes backend: vitest (`backend/vitest.config.ts`), `npm test` = `vitest run`; `globalSetup` em `backend/tests/setup.ts` exige `backend/.env.test` com banco contendo `jg_test` e roda `prisma migrate reset`. Factories em `backend/tests/factories.ts` (`criarCompany`, `criarBranch`, `criarUser`, `criarProduto`, `prisma` cru); cliente HTTP `como(token)` em `backend/tests/http.ts`.
- Typecheck: `npm run typecheck` (`tsc --noEmit`).
- Telas: verificação por navegador com Playwright e `/api/**` interceptado (D-19 da Fase 1).

## Contrato de saída

- Suíte em 2026-10-16: 23 arquivos / 68 testes verdes (`docs/farmacia/ORQUESTRADOR.md` §7).

## Limites e cotas

- `testTimeout`/`hookTimeout` 60000 ms (`backend/vitest.config.ts`).

## Erros conhecidos e tratamento

- `prisma migrate reset` é bloqueado pelo Prisma quando chamado por agente de IA sem `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`; o usuário autorizou o reset do `jg_test` nesta sessão (2026-10-16).
- O Playwright global pede outra revisão do Chromium; funciona passando `executablePath` do `chromium_headless_shell-1243` instalado (verificação de 2026-10-16).

## Riscos para a nossa implementação

- Geração de XML e de zip precisa de biblioteca: o backend já tem `@xmldom/xmldom` e `xml-crypto` (`backend/package.json`), mas nenhuma lib de zip — dependência nova.
- Validar o XML contra o XSD oficial exige o XSD em disco (download bloqueado, ver `sngpc-padrao-xml.md`).
- Testes de transmissão real ao SNGPC dependem de credencial do RT — não disponível.

## Fonte

- `backend/modulos.json:108`; `backend/src/utils/modulos.ts`; `backend/src/app.ts:122`; `backend/vitest.config.ts`; `backend/tests/setup.ts`; `backend/tests/factories.ts`; `backend/tests/http.ts`; `backend/package.json` — acessado em 2026-10-16
- `docs/farmacia/ORQUESTRADOR.md`, `docs/farmacia/00-DECISOES.md` (D-15, D-16, D-19) — acessado em 2026-10-16
