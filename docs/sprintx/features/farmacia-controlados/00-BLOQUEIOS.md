---
expx_schema: 1
expx_tool: sprintx
kind: bloqueios
trabalho_id: farmacia-controlados
atualizado_em: 2026-10-16
bloqueios:
  - id: B-01
    task: null
    aberto_em: 2026-10-16
    resolvido_em: null
    descricao: Aceite real no portal SNGPC depende do farmaceutico RT e do CNPJ reais da farmacia (D-03)
---

# Bloqueios

> Criado vazio na F1 e preenchido na execução (F6). Um bloqueio nunca vira pergunta ao usuário: registre aqui, marque a task `bloqueada` e siga para a próxima paralelizável.

B-01 | — (definição de pronto, D-03) | Aceite real dos XML no portal SNGPC: exige o farmacêutico RT da farmácia logado no portal da Anvisa (login próprio, sem CAPTCHA contornável) e a empresa com CNPJ real credenciado no SNGPC. As 33 tasks estão concluídas e o fluxo inteiro é provado por `backend/tests/sngpc-ponta-a-ponta.test.ts`; o XSD oficial não pôde ser baixado (lacuna da base). | O RT gera em `/sngpc.html` o inventário e a movimentação, faz o upload dos .zip no portal SNGPC, confere a mensagem de recebimento/validação e marca cada arquivo como enviado. Se o portal recusar, a mensagem de erro vira ocorrência para corrigir o gerador.
