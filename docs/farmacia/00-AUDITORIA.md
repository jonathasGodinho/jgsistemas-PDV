# Auditoria — farmacia

Data: 2026-10-13 (reauditoria — o plano foi regenerado na F3 endereçando os achados abaixo)

| severidade | arquivo | problema | correção sugerida |
|---|---|---|---|
| ALTA | sprint-01/tasks.md | O harness (T-01.01..T-01.04) não criava cliente HTTP nem exportava o app Express, mas várias tasks testam endpoints por HTTP e rotas protegidas exigem `autenticar`. | RESOLVIDO: adicionada F-01.3 com T-01.05 (extrai o `app` para módulo exportável sem `listen`, cliente HTTP de teste e helper de sessão); T-02.03 passou a alterar `app.ts`. |
| ALTA | sprint-01/tasks.md | `.env.test` (T-01.02) pressupunha um banco de teste sem declarar a origem; `prisma migrate` falha sem `DATABASE_URL` de teste. | RESOLVIDO: D-16 declara o Postgres de teste provisionado (dev fornece `DATABASE_URL` em `backend/.env.test`) e `ORQUESTRADOR.md` §4 registra. |
| MÉDIA | sprint-03/tasks.md, sprint-06/tasks.md | Testes funcionais de tela não são executáveis pelo harness backend-only. | RESOLVIDO: D-19 marca T-03.02/T-06.03 como verificação por navegador (playwright); DoD global ajustada. |
| MÉDIA | sprint-04/tasks.md | T-04.01 estende o recebimento de compra, cujo contrato é "NÃO DOCUMENTADO" em `base/compras.md`. | RESOLVIDO: T-04.01 declara a leitura integral de `compras.ts` como primeiro passo. |
| MÉDIA | sprint-06/sprint.md | Decisão aberta sobre incluir ou não lotes já vencidos no alerta. | RESOLVIDO: D-17 define que o alerta inclui vencidos e os que vencem dentro do limiar; T-06.01 alinhado. |
| MÉDIA | sprint-07/tasks.md | Formato da planilha CMED não declarado, tornando T-07.01 não-testável. | RESOLVIDO: D-18 fixa o CSV (`registroMS`, `descricao`, `pmc`) e T-01.03 cria a fixture `backend/tests/fixtures/cmed.csv`. |
| MÉDIA | sprint-08/tasks.md | T-08.03 depende de certificado/config SEFAZ de homologação não declarado. | RESOLVIDO: pré-requisito declarado em `ORQUESTRADOR.md` §4 e citado no objetivo de T-08.03. |
| MÉDIA | sprint-01/tasks.md, sprint-07/tasks.md | `paralelizavel: true` em tasks dependentes da task imediatamente anterior. | RESOLVIDO: T-01.03 e T-07.03 agora `paralelizavel: false`. |
| BAIXA | sprint-07/tasks.md | T-07.02 e T-07.04 podiam rodar em paralelo mas estavam sequenciais. | RESOLVIDO: ambas agora `paralelizavel: true` (arquivos distintos, sem dependência entre si). |
| BAIXA | sprint-02/tasks.md, sprint-08/tasks.md | `arquivos.cria` listava diretório em vez de arquivos. | RESOLVIDO: passou a indicar "(novo arquivo de migração)". |
| BAIXA | sprint-07/tasks.md | T-07.03 usava "PMC correto" (juízo). | RESOLVIDO: critério fixa o valor `pmc` exato da fixture. |
| BAIXA | sprint-03/tasks.md, sprint-06/tasks.md | T-03.02/T-06.03 dependem de playwright/ambiente de navegador não provisionado no harness (aceito por D-19). | Registrar quando a execução chegar nessas tasks; não bloqueia o backend. |

VEREDITO: SIM — o plano está pronto para execução autônoma.
