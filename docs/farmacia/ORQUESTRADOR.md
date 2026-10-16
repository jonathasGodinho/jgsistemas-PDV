# Orquestrador — farmacia

> Porta de entrada da execução. Escrito para quem abriu o repositório agora e não sabe nada. Só caminhos relativos; nunca o valor de um segredo.

## 1. Objetivo

Fazer o ERP JG Sistemas atender farmácias. A Fase 1 entrega: lote/validade com FEFO e alerta de vencimento; princípio ativo e tipo de medicamento; PMC/CMED com bloqueio de venda acima do teto; e tributação monofásica (ICMS-ST e PIS/COFINS). Tudo atrás do módulo `farmacia`, ligável por empresa. Vale em homologação SEFAZ.

## 2. Mapa e ordem de leitura

1. Este arquivo (`docs/farmacia/ORQUESTRADOR.md`)
2. `docs/farmacia/00-DECISOES.md` — decisões D-01..D-15 que governam o plano
3. `docs/farmacia/base/00-INDICE.md` — e os 11 arquivos da base que ele lista
4. `docs/farmacia/sprint-01/sprint.md` → `fases.md` → `tasks.md`
5. `docs/farmacia/sprint-02/` → `sprint-06/` em diante, na ordem (cada `sprint.md` → `fases.md` → `tasks.md`)
6. `docs/farmacia/sprint-07/` → `sprint-08/`
7. `docs/farmacia/00-BLOQUEIOS.md` — bloqueios registrados durante a execução
8. `docs/farmacia/00-AUDITORIA.md` — achados MÉDIA/BAIXA que permanecem válidos (gerado na F5)

## 3. Rota de execução

- Sprint 01: F-01.1 → F-01.2 → F-01.3
- Sprint 02: F-02.1 ∥ F-02.2
- Sprint 03: F-03.1 → F-03.2
- Sprint 04: F-04.1 → F-04.2
- Sprint 05: F-05.1 → F-05.2
- Sprint 06: F-06.1 → F-06.2
- Sprint 07: F-07.1 → F-07.2
- Sprint 08: F-08.1 → F-08.2

Paralelismo declarado no plano (não ampliar na execução):

- F-02.1 ∥ F-02.2 (arquivos disjuntos: schema/migrations vs `farmacia.ts`/`modulos.json`/`server.ts`)
- T-05.02 ∥ T-05.03 (arquivos disjuntos: `vendas.ts` vs `vendasForaPdv.ts`)
- T-07.01 ∥ T-07.03 (arquivos disjuntos: `cmed.ts` vs `pmc.ts`) — na prática T-07.03 depende de T-07.01, então roda logo depois
- Fases marcadas "nenhuma" são estritamente sequenciais.

**Caminho crítico:** T-01.01 → T-01.02 → T-01.03 → T-01.04 → T-01.05 → T-02.01 → T-02.02 → T-04.01 → T-04.02 → T-05.01 → T-05.02 → T-07.04 → T-08.01 → T-08.02 → T-08.03 (a cauda do PMC depende ainda de T-07.01 → T-07.03 e de T-05.03).

## 4. Ferramentas

- **MCPs / SDKs:** nenhum além do padrão do projeto (Express, Prisma, node-forge, xml-crypto, qrcode). Testes backend usarão **vitest** (D-15) com cliente HTTP de teste (T-01.05); testes de tela usarão **playwright** (D-19).
- **Testes backend:** `npm test` no diretório `backend/` (comando `test` criado na sprint-01; hoje NÃO EXISTE NO PROJETO).
- **Testes de frontend:** verificação por navegador (playwright) para T-03.02 e T-06.03 (D-19).
- **Lint:** NÃO EXISTE NO PROJETO.
- **Typecheck:** `npm run typecheck` no diretório `backend/` (executa `tsc --noEmit` — `backend/package.json:8`).
- **Migrações:** `npx prisma migrate dev` no diretório `backend/` (`backend/prisma/schema.prisma`).
- **Segredos:** `DATABASE_URL` — fica no `.env` local do backend e nas variáveis de ambiente da Vercel (Supabase); o **banco de teste** é um Postgres provisionado à parte, com `DATABASE_URL` de teste no `backend/.env.test` (D-16). A configuração fiscal (`nfe_config`) é lida do banco via `NFE_CONFIG_KEY` (`backend/src/nfe/config.ts:6`), não de variável de ambiente; a emissão em homologação (T-08.03) exige `nfe_config` de homologação + certificado. A planilha CMED é CSV com colunas `registroMS,descricao,pmc` (D-18), sem segredo. NUNCA escreva valores.

## 5. Agentes

- **Implementador** — escreve primeiro os dois testes da task (`teste_integracao` e `teste_funcional`), vê ambos falharem, implementa até passarem.
- **Revisor de testes** — antes de aceitar o verde, responde: este teste falharia com uma implementação errada? Se não, o teste volta.
- **Auditor de aceite** — verifica de fato o `criterio_aceite` da task antes de permitir `status: concluida`.

**Agente único:** assume os três papéis em sequência dentro de cada task, nesta ordem, tratando cada papel como um portão — não avança ao papel seguinte sem fechar o anterior.

## 6. Regras de autonomia

1. Não pergunte nada; não peça autorização para nada.
2. O teste vem antes do código, sempre.
3. Task só é `concluida` com teste de integração E funcional passando e `criterio_aceite` verificado. Não existe "concluído com ressalva".
4. Dúvida nova ou pré-requisito faltando: registrar em `00-BLOQUEIOS.md` (`B-NN | task | bloqueio | o que destravaria`), marcar a task `bloqueada`, pular para a próxima paralelizável. Nunca parar e esperar.
5. Só rode em paralelo o que o plano declarou paralelizável; a execução nunca decide paralelismo.
6. Atualize `status` em `tasks.md` a cada transição; ao concluir, acrescente data e resultado da suíte.
7. Critério de saída de fase/sprint não atendido = não avança.

## 7. Definição de pronto global

> **Estado em 2026-10-16 (27 de 28 tasks `concluida`; T-08.03 `bloqueada` por B-02; B-01 e B-04 resolvidos).** Cada item abaixo traz a evidência. O último item é o único não comprovado integralmente.

- [x] `npm test` no backend passa (exit 0) com os testes das tasks de backend verdes; os testes de tela (T-03.02, T-06.03, T-08.05) são verificados por navegador (D-19). — `npm test` → **23 files / 68 tests passed** (2026-10-16, após D-20); telas verificadas por navegador nas Sprints 03, 06 e 08 e na entrega do D-20.
- [x] `npm run typecheck` no backend passa (exit 0). — `tsc --noEmit` → **exit 0**.
- [x] Cadastro de produto com princípio ativo, tipo, Registro MS, PMC, MVA de ST e redução de ST funciona (API e tela) com o módulo `farmacia` ativo. — Sprints 02–03 (`tests/farmacia-produto-*.test.ts`, `frontend/produto.html`); `mvaSt`/`reducaoSt` entraram na API na Sprint-08 (`tests/farmacia-produto-api.test.ts`) e ganharam campo na tela em T-08.05 (verificado por navegador, D-19).
- [x] Venda de medicamento com lotes consome o de menor validade (FEFO) nas duas rotas; produto sem lote continua vendendo. — Sprint-05 (`tests/farmacia-fefo.test.ts`, `tests/venda-fora-pdv-fefo.test.ts`).
- [x] Alerta de vencimento lista lotes dentro do limiar configurável por admin. — Sprints 04 e 06 (`tests/farmacia-vencimento.test.ts`, `frontend/estoque.html`, `frontend/configuracoes.html`).
- [x] Upload da CMED substitui a tabela PMC; venda acima do PMC é bloqueada quando há PMC. — Sprint-07 (`tests/farmacia-cmed-*.test.ts`, `tests/farmacia-pmc-*.test.ts`).
- [ ] NFC-e de venda de medicamento retorna status AUTORIZADA em homologação SEFAZ. — **Parcial**: comprovado em ambiente simulado (`NFE_CERT_MODE=test` + `NFE_DRY_RUN=1`) por `tests/farmacia-fiscal-homologacao.test.ts` (T-08.03); o aceite contra a SEFAZ-AM real depende de certificado A1 e CSC reais → **B-02** em `docs/farmacia/00-BLOQUEIOS.md`.

**Consequência (regra 7):** a Fase 1 permanece aberta até B-02 ser destravado e a NFC-e ser aceita na SEFAZ real. Nada mais está pendente: as 27 tasks restantes estão `concluida` (5+3+2+2+4+3+4+5 em `docs/farmacia/sprint-NN/tasks.md` — a Sprint-08 tem 5 tasks: T-08.01, T-08.02, T-08.04 e T-08.05 `concluida`, T-08.03 `bloqueada`) e a suíte (23 files / 68 tests) e o typecheck estão verdes. B-01 (lote no cancelamento/devolução) e B-04 (evento do shell) foram resolvidos em 2026-10-16 — ver D-20/D-21 e `docs/farmacia/00-BLOQUEIOS.md`.

## 8. Como retomar uma sessão interrompida

1. Leia este arquivo (`docs/farmacia/ORQUESTRADOR.md`).
2. Leia os `status` em cada `docs/farmacia/sprint-NN/tasks.md`.
3. Leia `docs/farmacia/00-BLOQUEIOS.md`.
4. Continue da primeira task `pendente` ou `em_andamento` cujas dependências (`depende_de`) estão `concluida`. Não inicie tasks `bloqueada` até o bloqueio ser destravado.
5. Se só restarem tasks `concluida` e `bloqueada`, não há trabalho executável: o próximo passo é destravar o bloqueio (§ `00-BLOQUEIOS.md`) — hoje, **B-02** (certificado A1 + CSC de homologação).
