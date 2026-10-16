---
expx_schema: 1
expx_tool: sprintx
kind: plano
trabalho_id: farmacia-controlados
sprint_id: sprint-07
atualizado_em: 2026-10-16
sprint:
  titulo: "Tela SNGPC e fluxo ponta a ponta"
  status: concluido
  criterio_saida: "npm test termina com 0 failed incluindo sngpc-ponta-a-ponta e a tela sngpc.html verificada por navegador sem pageerror"
  riscos: ["Aceite real no portal SNGPC depende do RT e do CNPJ reais da farmacia (D-03); sem eles a entrega fica pronta em simulacao"]
  fora_de_escopo: ["Envio automatico (D-02)"]
fases:
  - id: F-07.1
    titulo: "Tela do RT e prova ponta a ponta"
    status: concluido
    criterio_saida: "Tela sngpc.html opera geracao, download, envio e livro, e o teste ponta a ponta passa"
    paralelizavel: false
    paralela_com: []
    tasks: [T-07.01, T-07.02, T-07.03]
tasks:
  - id: T-07.01
    titulo: "Tela SNGPC do RT"
    fase: F-07.1
    status: concluida
    objetivo: "frontend/sngpc.html com painel, geracao, historico, download, marcar enviado e inconsistencias, com item no menu do modulo farmacia."
    arquivos:
      cria: [frontend/sngpc.html]
      altera: [frontend/ui/shell.js, backend/modulos.json]
    teste_integracao: "No navegador com /api interceptado, o painel mostra ultimo arquivo, alerta de prazo e pendencias, e Gerar movimentacao faz o POST e lista o arquivo."
    teste_funcional: "No navegador, Baixar chama GET /download e Marcar enviado chama POST /enviado."
    criterio_aceite: "Verificacao por navegador registra os dois cenarios com zero pageerror."
    depende_de: []
    paralelizavel: false
    concluida_em: 2026-10-16
    suite: parcial
  - id: T-07.02
    titulo: "Tela do livro de escrituracao"
    fase: F-07.1
    status: concluida
    objetivo: "sngpc.html ganha a secao do livro de escrituracao com filtro de periodo."
    arquivos:
      cria: []
      altera: [frontend/sngpc.html]
    teste_integracao: "No navegador, filtrar o periodo chama GET /api/farmacia/sngpc/livro com inicio e fim e lista as linhas devolvidas."
    teste_funcional: "No navegador, periodo sem movimentos mostra o estado vazio."
    criterio_aceite: "Verificacao por navegador registra os dois cenarios com zero pageerror."
    depende_de: [T-07.01]
    paralelizavel: false
    concluida_em: 2026-10-16
    suite: parcial
  - id: T-07.03
    titulo: "Fluxo SNGPC ponta a ponta"
    fase: F-07.1
    status: concluida
    objetivo: "Teste de compra com NF, venda com receita, perda, inventario e movimentacao pelas rotas reais."
    arquivos:
      cria: [backend/tests/sngpc-ponta-a-ponta.test.ts]
      altera: []
    teste_integracao: "Compra de 10, venda de 3 com receita e perda de 1 pelas rotas geram movimentacao com uma entrada, uma venda e uma perda."
    teste_funcional: "O inventario gerado depois do fluxo tem quantidade 6 para o lote, igual ao saldo do lote no banco."
    criterio_aceite: "backend/tests/sngpc-ponta-a-ponta.test.ts passa."
    depende_de: []
    paralelizavel: true
    concluida_em: 2026-10-16
    suite: parcial
---

# Plano — Sprint 07 — Tela SNGPC e fluxo ponta a ponta

## Objetivo da sprint

O RT opera o SNGPC por uma tela propria e um teste ponta a ponta prova que o fluxo inteiro gera arquivos coerentes com o estoque.

## Critério de saída da sprint

npm test termina com 0 failed incluindo sngpc-ponta-a-ponta e a tela sngpc.html verificada por navegador sem pageerror.

## Riscos conhecidos

- Aceite real no portal SNGPC depende do RT e do CNPJ reais da farmacia (D-03); sem eles a entrega fica pronta em simulacao

## Fora de escopo

- Envio automatico (D-02)

## Fase F-07.1 — Tela do RT e prova ponta a ponta

**Objetivo:** O RT opera o SNGPC por uma tela propria e um teste ponta a ponta prova que o fluxo inteiro gera arquivos coerentes com o estoque.

**Tasks:** T-07.01, T-07.02, T-07.03

**Critério de saída:** Tela sngpc.html opera geracao, download, envio e livro, e o teste ponta a ponta passa.

**Roda em paralelo com:** nenhuma.

**Caminho crítico:** T-07.01 → T-07.02

### Grafo de tasks

```mermaid
%% Grafo de tasks — sprint-07 — gerado pela sprintx a partir deste arquivo
flowchart LR
  subgraph fase_07_1["F-07.1 Tela do RT e prova ponta a ponta"]
    T_07_01["T-07.01<br/>Tela SNGPC do RT"]
    T_07_02["T-07.02<br/>Tela do livro de…"]
    T_07_03["T-07.03<br/>Fluxo SNGPC ponta a ponta"]
  end
  T_07_01 --> T_07_02
  classDef concluida fill:#d4f4dd,stroke:#2e7d32,color:#1b3d20
  classDef andamento fill:#fff3cd,stroke:#b8860b,color:#4a3800
  classDef bloqueada fill:#f8d7da,stroke:#c62828,color:#4a1d1f
  classDef pendente  fill:#eceff1,stroke:#78909c,color:#263238
  classDef critico   stroke-width:3px
  class T_07_01 concluida
  class T_07_02 concluida
  class T_07_03 concluida
  class T_07_01,T_07_02 critico
```

## Tasks

---

```yaml
id: T-07.01
titulo: "Tela SNGPC do RT"
objetivo: "frontend/sngpc.html com painel, geracao, historico, download, marcar enviado e inconsistencias, com item no menu do modulo farmacia."
arquivos:
  cria: [frontend/sngpc.html]
  altera: [frontend/ui/shell.js, backend/modulos.json]
teste_integracao: "No navegador com /api interceptado, o painel mostra ultimo arquivo, alerta de prazo e pendencias, e Gerar movimentacao faz o POST e lista o arquivo."
teste_funcional: "No navegador, Baixar chama GET /download e Marcar enviado chama POST /enviado."
criterio_aceite: "Verificacao por navegador registra os dois cenarios com zero pageerror."
depende_de: []
paralelizavel: false
status: concluida
resultado: 2026-10-16 · suíte: navegador: painel, gerar, baixar, enviado; 0 pageerror · real: 1.0 h
```

---

```yaml
id: T-07.02
titulo: "Tela do livro de escrituracao"
objetivo: "sngpc.html ganha a secao do livro de escrituracao com filtro de periodo."
arquivos:
  cria: []
  altera: [frontend/sngpc.html]
teste_integracao: "No navegador, filtrar o periodo chama GET /api/farmacia/sngpc/livro com inicio e fim e lista as linhas devolvidas."
teste_funcional: "No navegador, periodo sem movimentos mostra o estado vazio."
criterio_aceite: "Verificacao por navegador registra os dois cenarios com zero pageerror."
depende_de: [T-07.01]
paralelizavel: false
status: concluida
resultado: 2026-10-16 · suíte: navegador: livro com linhas e vazio; 0 pageerror · real: 0.3 h
```

---

```yaml
id: T-07.03
titulo: "Fluxo SNGPC ponta a ponta"
objetivo: "Teste de compra com NF, venda com receita, perda, inventario e movimentacao pelas rotas reais."
arquivos:
  cria: [backend/tests/sngpc-ponta-a-ponta.test.ts]
  altera: []
teste_integracao: "Compra de 10, venda de 3 com receita e perda de 1 pelas rotas geram movimentacao com uma entrada, uma venda e uma perda."
teste_funcional: "O inventario gerado depois do fluxo tem quantidade 6 para o lote, igual ao saldo do lote no banco."
criterio_aceite: "backend/tests/sngpc-ponta-a-ponta.test.ts passa."
depende_de: []
paralelizavel: true
status: concluida
resultado: 2026-10-16 · suíte: sngpc-ponta-a-ponta 1 passed, 0 failed · real: 0.5 h
```
