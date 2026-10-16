---
expx_schema: 1
expx_tool: sprintx
kind: orquestrador
trabalho_id: farmacia-controlados
titulo: Farmacia Fase 2 - medicamentos controlados, antimicrobianos e SNGPC
tipo_trabalho: feature
tipo_ocorrencia: null
estagio: f6
status: em_andamento
criado_em: 2026-10-16
atualizado_em: 2026-10-16
concluido_em: null
sprints: [sprint-01, sprint-02, sprint-03, sprint-04, sprint-05, sprint-06, sprint-07]
caminho_critico: [T-01.01, T-01.03, T-02.01, T-02.02, T-02.04, T-03.01, T-03.02, T-03.03, T-03.04, T-04.01, T-04.02, T-05.01, T-05.02, T-05.03, T-06.02, T-06.04, T-06.05, T-06.06, T-06.07, T-07.01, T-07.02]
modulo_afetado: [prisma, routes, utils, middlewares, tests, frontend, raiz]
arquivos_alterados: []
palavras_chave: [sngpc, controlados, portaria-344, antimicrobianos, receita, anvisa, xml, farmacia]
worktree: ../jgsistemas-PDV--farmacia-controlados
---

# Orquestrador — farmacia-controlados

> Porta de entrada da execução. Escrito para quem abriu o repositório agora e não sabe nada. Só caminhos relativos; nunca o valor de um segredo.

## 1. Objetivo

Fazer o ERP JG Sistemas escriturar medicamentos controlados (Portaria 344/98) e antimicrobianos (RDC 471/2021) para o SNGPC da ANVISA:
cadastro SNGPC no produto e farmacêutico RT no operador; receita obrigatória e validada na venda (PDV, venda a prazo, orçamento);
NF nas entradas e motivo nas perdas; geração dos XML de inventário e de movimentação (padrão Guia v2.3) em zip, para o RT enviar no portal;
painel de prazo de 7 dias, livro de escrituração e inconsistências. Tudo dentro do módulo `farmacia` existente.

## 2. Mapa e ordem de leitura

Todos os caminhos abaixo são relativos a `docs/sprintx/features/farmacia-controlados/`.

1. Este arquivo (`ORQUESTRADOR.md`)
2. `00-DECISOES.md` — decisões D-00..D-30 e os contratos C-01 (dados) e C-02 (API)
3. `base/00-INDICE.md` — e os 6 arquivos da base que ele lista, mais `base/00-LACUNAS.md`
4. `sprint-01/tasks.md` (formato condensado: sprint, fase e tasks num arquivo só)
5. `sprint-02/tasks.md` → `sprint-03/tasks.md` → `sprint-04/tasks.md` → `sprint-05/tasks.md` → `sprint-06/tasks.md` → `sprint-07/tasks.md`
6. `00-BLOQUEIOS.md` — bloqueios registrados durante a execução
7. `00-AUDITORIA.md` — achados MÉDIA/BAIXA que permanecem válidos (gerado na F5)

Contexto da Fase 1 (lote, FEFO, livro-razão do lote D-20): `docs/farmacia/ORQUESTRADOR.md` e `docs/farmacia/00-DECISOES.md`.

## 3. Rota de execução

As sprints são estritamente sequenciais (critério de saída de uma sprint é pré-requisito da seguinte). Cada sprint tem uma fase.

- Sprint 01 — F-01.1: T-01.01 ∥ T-01.02; depois T-01.03 (depende de T-01.01)
- Sprint 02 — F-02.1: T-02.01 ∥ T-02.03; T-02.02 depois de T-02.01; T-02.04 depois de T-02.02; T-02.05 depois de T-02.03
- Sprint 03 — F-03.1: T-03.06 em paralelo com a cadeia T-03.01 → T-03.02 → T-03.03 → {T-03.04, T-03.05}; T-03.07 depois de T-03.02
- Sprint 04 — F-04.1: T-04.01 → {T-04.02, T-04.03, T-04.04} (sequenciais: dependem de T-04.01 e não são paralelizáveis)
- Sprint 05 — F-05.1: T-05.04 em paralelo com a cadeia T-05.01 → T-05.02 → T-05.03
- Sprint 06 — F-06.1: T-06.01 ∥ T-06.02 ∥ T-06.03; T-06.04 (de T-06.02 e T-06.03) → T-06.05 (de T-06.01 e T-06.04) → T-06.06 → T-06.07
- Sprint 07 — F-07.1: T-07.03 em paralelo com a cadeia T-07.01 → T-07.02

Paralelismo declarado: só as tasks com `paralelizavel: true` nos `tasks.md` (T-01.01, T-01.02, T-02.01, T-02.03, T-03.06, T-05.04, T-06.01, T-06.02, T-06.03, T-07.03). A execução não amplia isso.

**Caminho crítico:** T-01.01 → T-01.03 → T-02.01 → T-02.02 → T-02.04 → T-03.01 → T-03.02 → T-03.03 → T-03.04 → T-04.01 → T-04.02 → T-05.01 → T-05.02 → T-05.03 → T-06.02 → T-06.04 → T-06.05 → T-06.06 → T-06.07 → T-07.01 → T-07.02

## 4. Ferramentas

- **MCPs / SDKs:** nenhum além do padrão do projeto (Express 5, Prisma 6, `@xmldom/xmldom`). Dependência nova: `fflate` (zip, D-17), adicionada em T-01.02. Telas verificadas com Playwright (D-19 da Fase 1) usando o Chromium instalado em `chromium_headless_shell-1243` via `executablePath`.
- **Testes:** `npm test` no diretório `backend/` (= `vitest run`). O `globalSetup` (`backend/tests/setup.ts`) reseta o banco `jg_test`; o Prisma exige `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` com o texto exato do consentimento do usuário quando rodado por agente de IA.
- **Lint:** NÃO EXISTE NO PROJETO.
- **Typecheck:** `npm run typecheck` no diretório `backend/` (`tsc --noEmit`).
- **Migrações:** nova pasta em `backend/prisma/migrations/`; SQL gerado por `npx prisma migrate diff --from-schema-datamodel <schema anterior> --to-schema-datamodel prisma/schema.prisma --script`. Produção: `npx prisma migrate deploy` antes do deploy do código.
- **Segredos:** `DATABASE_URL` — em `backend/.env` (dev) e nas variáveis do projeto na Vercel (produção); `DATABASE_URL` de teste em `backend/.env.test` (precisa conter `jg_test`). Nenhum segredo novo nesta feature (D-21); a senha do RT no portal SNGPC NUNCA entra no sistema (D-02).

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

- [ ] `npm test` no backend termina com 0 failed, com os testes de todas as tasks de backend verdes; as telas (T-02.04, T-02.05, T-04.01..T-04.04, T-05.03, T-07.01, T-07.02) verificadas por navegador sem pageerror.
- [ ] `npm run typecheck` no backend sai com 0.
- [ ] Produto SNGPC (classe, lista, unidade) e farmacêutico RT (CPF, CRF, UF) cadastráveis por API e tela.
- [ ] Venda de produto SNGPC no PDV, na venda a prazo e na efetivação de orçamento exige receita válida e saldo em lote; receita vencida é recusada; quantidade acima do máximo só passa confirmada.
- [ ] Compra de produto SNGPC exige NF; saída/ajuste para baixo exigem motivo SNGPC; ajuste para cima é recusado.
- [ ] O RT gera, baixa e marca como enviados os XML de inventário e de movimentação (zip + MD5); o painel avisa quando passa de 7 dias; estorno de venda exportada abre inconsistência.
- [ ] O teste ponta a ponta (T-07.03) prova que o inventário gerado depois do fluxo confere com o saldo dos lotes.
- [ ] **Aceite externo (D-03):** o RT da farmácia faz o upload do zip de inventário e de movimentação no portal SNGPC e o arquivo é aceito. Sem RT/CNPJ reais disponíveis, registrar o bloqueio em `00-BLOQUEIOS.md` e a feature fica "pronta em simulação" até o aceite.

## 8. Como retomar uma sessão interrompida

1. Leia este arquivo inteiro.
2. Leia o `status` de cada task em cada `sprint-NN/tasks.md`.
3. Leia `00-BLOQUEIOS.md`.
4. Continue da primeira task `pendente` ou `em_andamento` cujas dependências (`depende_de`) estão todas `concluida`. Ignore as `bloqueada` até que o bloqueio registrado seja resolvido.
