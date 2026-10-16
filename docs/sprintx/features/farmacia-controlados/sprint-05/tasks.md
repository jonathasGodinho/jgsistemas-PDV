---
expx_schema: 1
expx_tool: sprintx
kind: plano
trabalho_id: farmacia-controlados
sprint_id: sprint-05
atualizado_em: 2026-10-16
sprint:
  titulo: "Entradas, perdas e inconsistencias"
  status: nao_iniciado
  criterio_saida: "npm test termina com 0 failed incluindo sngpc-compra, sngpc-estoque-manual e sngpc-inconsistencia, e telas verificadas por navegador"
  riscos: ["Fornecedor sem CNPJ cadastrado impede receber compra de controlado (D-13)"]
  fora_de_escopo: ["Transferencia entre estabelecimentos (D-27)"]
fases:
  - id: F-05.1
    titulo: "NF, motivo de perda e inconsistencia"
    status: nao_iniciado
    criterio_saida: "Livro-razao de produto SNGPC guarda NF nas entradas e motivo nas perdas, e estorno pos-exportacao gera inconsistencia"
    paralelizavel: false
    paralela_com: []
    tasks: [T-05.01, T-05.02, T-05.03, T-05.04]
tasks:
  - id: T-05.01
    titulo: "Compra de SNGPC exige NF"
    fase: F-05.1
    status: pendente
    objetivo: "Receber compra com item SNGPC exige nfNumero, nfData e CNPJ do fornecedor, gravados em Purchase e no LoteMovimento ENTRADA_COMPRA (D-13)."
    arquivos:
      cria: [backend/tests/sngpc-compra.test.ts]
      altera: [backend/src/routes/compras.ts, backend/src/utils/fefo.ts]
    teste_integracao: "Receber compra com item B1 sem NF responde 400 e com NF grava Purchase.nfNumero e LoteMovimento ENTRADA_COMPRA com nfNumero e cnpjOrigem do fornecedor."
    teste_funcional: "Compra so de produto sem classeSngpc recebe sem NF com 200."
    criterio_aceite: "backend/tests/sngpc-compra.test.ts passa e farmacia-compra-lote.test.ts continua verde."
    depende_de: []
    paralelizavel: false
    concluida_em: null
    suite: nao_executada
  - id: T-05.02
    titulo: "Movimento manual de SNGPC"
    fase: F-05.1
    status: pendente
    objetivo: "Saida e ajuste para baixo de produto SNGPC exigem motivoPerda 1 a 9; entrada exige NF e lote; ajuste para cima e recusado (D-14)."
    arquivos:
      cria: [backend/tests/sngpc-estoque-manual.test.ts]
      altera: [backend/src/routes/estoque.ts]
    teste_integracao: "Saida de produto B1 sem motivoPerda responde 400 e com motivoPerda 3 grava LoteMovimento com motivoPerda 3."
    teste_funcional: "Ajuste de B1 de 5 para 8 responde 400 e o mesmo ajuste em produto sem classeSngpc responde 200."
    criterio_aceite: "backend/tests/sngpc-estoque-manual.test.ts passa e farmacia-lote-livro.test.ts continua verde."
    depende_de: [T-05.01]
    paralelizavel: false
    concluida_em: null
    suite: nao_executada
  - id: T-05.03
    titulo: "Telas de compra e estoque para SNGPC"
    fase: F-05.1
    status: pendente
    objetivo: "compras.html pede NF ao receber item SNGPC e estoque.html pede motivo SNGPC na saida e no ajuste."
    arquivos:
      cria: []
      altera: [frontend/compras.html, frontend/estoque.html]
    teste_integracao: "No navegador, receber compra com item controlado mostra numero e data da NF e envia os dois no corpo."
    teste_funcional: "No navegador, a saida de produto controlado mostra os 9 motivos SNGPC e nao envia sem motivo."
    criterio_aceite: "Verificacao por navegador registra os dois cenarios com zero pageerror."
    depende_de: [T-05.02]
    paralelizavel: false
    concluida_em: null
    suite: nao_executada
  - id: T-05.04
    titulo: "Inconsistencia ao estornar venda exportada"
    fase: F-05.1
    status: pendente
    objetivo: "Cancelamento ou devolucao de venda SNGPC dentro de periodo ja exportado cria SngpcInconsistencia ABERTA (D-05)."
    arquivos:
      cria: [backend/src/utils/sngpc/inconsistencias.ts, backend/tests/sngpc-inconsistencia.test.ts]
      altera: [backend/src/routes/vendas.ts, backend/src/routes/trocas.ts]
    teste_integracao: "Cancelar venda B1 cuja data esta dentro de um SngpcArquivo MOVIMENTACAO cria SngpcInconsistencia ABERTA ligada a venda."
    teste_funcional: "Devolucao via POST /api/trocas de venda B1 exportada cria inconsistencia, e cancelar venda de periodo nao exportado nao cria."
    criterio_aceite: "backend/tests/sngpc-inconsistencia.test.ts passa."
    depende_de: []
    paralelizavel: true
    concluida_em: null
    suite: nao_executada
---

# Plano — Sprint 05 — Entradas, perdas e inconsistencias

## Objetivo da sprint

Compra e movimentos manuais de produto SNGPC passam a registrar NF e motivo de perda no livro-razao, e o estorno de venda ja exportada abre inconsistencia.

## Critério de saída da sprint

npm test termina com 0 failed incluindo sngpc-compra, sngpc-estoque-manual e sngpc-inconsistencia, e telas verificadas por navegador.

## Riscos conhecidos

- Fornecedor sem CNPJ cadastrado impede receber compra de controlado (D-13)

## Fora de escopo

- Transferencia entre estabelecimentos (D-27)

## Fase F-05.1 — NF, motivo de perda e inconsistencia

**Objetivo:** Compra e movimentos manuais de produto SNGPC passam a registrar NF e motivo de perda no livro-razao, e o estorno de venda ja exportada abre inconsistencia.

**Tasks:** T-05.01, T-05.02, T-05.03, T-05.04

**Critério de saída:** Livro-razao de produto SNGPC guarda NF nas entradas e motivo nas perdas, e estorno pos-exportacao gera inconsistencia.

**Roda em paralelo com:** nenhuma.

**Caminho crítico:** T-05.01 → T-05.02 → T-05.03

### Grafo de tasks

```mermaid
%% Grafo de tasks — sprint-05 — gerado pela sprintx a partir deste arquivo
flowchart LR
  subgraph fase_05_1["F-05.1 NF, motivo de perda e inconsistencia"]
    T_05_01["T-05.01<br/>Compra de SNGPC exige NF"]
    T_05_02["T-05.02<br/>Movimento manual de SNGPC"]
    T_05_03["T-05.03<br/>Telas de compra e estoque…"]
    T_05_04["T-05.04<br/>Inconsistencia ao estornar…"]
  end
  T_05_01 --> T_05_02
  T_05_02 --> T_05_03
  classDef concluida fill:#d4f4dd,stroke:#2e7d32,color:#1b3d20
  classDef andamento fill:#fff3cd,stroke:#b8860b,color:#4a3800
  classDef bloqueada fill:#f8d7da,stroke:#c62828,color:#4a1d1f
  classDef pendente  fill:#eceff1,stroke:#78909c,color:#263238
  classDef critico   stroke-width:3px
  class T_05_01 pendente
  class T_05_02 pendente
  class T_05_03 pendente
  class T_05_04 pendente
  class T_05_01,T_05_02,T_05_03 critico
```

## Tasks

---

```yaml
id: T-05.01
titulo: "Compra de SNGPC exige NF"
objetivo: "Receber compra com item SNGPC exige nfNumero, nfData e CNPJ do fornecedor, gravados em Purchase e no LoteMovimento ENTRADA_COMPRA (D-13)."
arquivos:
  cria: [backend/tests/sngpc-compra.test.ts]
  altera: [backend/src/routes/compras.ts, backend/src/utils/fefo.ts]
teste_integracao: "Receber compra com item B1 sem NF responde 400 e com NF grava Purchase.nfNumero e LoteMovimento ENTRADA_COMPRA com nfNumero e cnpjOrigem do fornecedor."
teste_funcional: "Compra so de produto sem classeSngpc recebe sem NF com 200."
criterio_aceite: "backend/tests/sngpc-compra.test.ts passa e farmacia-compra-lote.test.ts continua verde."
depende_de: []
paralelizavel: false
status: pendente
```

---

```yaml
id: T-05.02
titulo: "Movimento manual de SNGPC"
objetivo: "Saida e ajuste para baixo de produto SNGPC exigem motivoPerda 1 a 9; entrada exige NF e lote; ajuste para cima e recusado (D-14)."
arquivos:
  cria: [backend/tests/sngpc-estoque-manual.test.ts]
  altera: [backend/src/routes/estoque.ts]
teste_integracao: "Saida de produto B1 sem motivoPerda responde 400 e com motivoPerda 3 grava LoteMovimento com motivoPerda 3."
teste_funcional: "Ajuste de B1 de 5 para 8 responde 400 e o mesmo ajuste em produto sem classeSngpc responde 200."
criterio_aceite: "backend/tests/sngpc-estoque-manual.test.ts passa e farmacia-lote-livro.test.ts continua verde."
depende_de: [T-05.01]
paralelizavel: false
status: pendente
```

---

```yaml
id: T-05.03
titulo: "Telas de compra e estoque para SNGPC"
objetivo: "compras.html pede NF ao receber item SNGPC e estoque.html pede motivo SNGPC na saida e no ajuste."
arquivos:
  cria: []
  altera: [frontend/compras.html, frontend/estoque.html]
teste_integracao: "No navegador, receber compra com item controlado mostra numero e data da NF e envia os dois no corpo."
teste_funcional: "No navegador, a saida de produto controlado mostra os 9 motivos SNGPC e nao envia sem motivo."
criterio_aceite: "Verificacao por navegador registra os dois cenarios com zero pageerror."
depende_de: [T-05.02]
paralelizavel: false
status: pendente
```

---

```yaml
id: T-05.04
titulo: "Inconsistencia ao estornar venda exportada"
objetivo: "Cancelamento ou devolucao de venda SNGPC dentro de periodo ja exportado cria SngpcInconsistencia ABERTA (D-05)."
arquivos:
  cria: [backend/src/utils/sngpc/inconsistencias.ts, backend/tests/sngpc-inconsistencia.test.ts]
  altera: [backend/src/routes/vendas.ts, backend/src/routes/trocas.ts]
teste_integracao: "Cancelar venda B1 cuja data esta dentro de um SngpcArquivo MOVIMENTACAO cria SngpcInconsistencia ABERTA ligada a venda."
teste_funcional: "Devolucao via POST /api/trocas de venda B1 exportada cria inconsistencia, e cancelar venda de periodo nao exportado nao cria."
criterio_aceite: "backend/tests/sngpc-inconsistencia.test.ts passa."
depende_de: []
paralelizavel: true
status: pendente
```
