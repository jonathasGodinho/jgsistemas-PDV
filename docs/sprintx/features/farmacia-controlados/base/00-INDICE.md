---
expx_schema: 1
expx_tool: sprintx
kind: base_indice
trabalho_id: farmacia-controlados
atualizado_em: 2026-10-16
areas:
  - arquivo: sngpc-padrao-xml.md
    titulo: SNGPC padrao XML de inventario e movimentacao
    lacunas: 4
  - arquivo: sngpc-transmissao.md
    titulo: SNGPC transmissao portal webservice e API REST
    lacunas: 2
  - arquivo: regulacao-controlados.md
    titulo: Regulacao RDC 22 Portaria 344 RDC 471 SNCR
    lacunas: 2
  - arquivo: modelo-dados-atual.md
    titulo: Modelo de dados atual
    lacunas: 1
  - arquivo: fluxos-venda-estoque.md
    titulo: Fluxos de venda compra e estoque
    lacunas: 0
  - arquivo: modulos-e-testes.md
    titulo: Gating de modulo e harness de testes
    lacunas: 0
---

# Índice da base — farmacia-controlados

Fase 2 da farmácia: medicamentos controlados (Portaria 344/98) e antimicrobianos, com escrituração para o SNGPC. Contexto da Fase 1 em `docs/farmacia/`.

| Arquivo | Área | Resumo |
|---|---|---|
| `sngpc-padrao-xml.md` | SNGPC — padrão XML | Leiaute v2.3 (set/2025) do XML de inventário e de movimentação, regras de preenchimento e enums |
| `sngpc-transmissao.md` | SNGPC — transmissão | Upload no portal pelo RT, webservice SOAP (bloqueado por CAPTCHA) e API REST nova sem documentação de resposta |
| `regulacao-controlados.md` | Regulação | RDC 22/2014 (escrituração 1–7 dias, guarda 2 anos, acesso do RT), receituários da Portaria 344, RDC 471 e SNCR |
| `modelo-dados-atual.md` | Dados | O que o schema já tem (Lote, LoteMovimento, Registro MS) e o que falta para o SNGPC |
| `fluxos-venda-estoque.md` | Fluxos | Rotas e telas que movimentam medicamento e onde a receita teria de ser capturada |
| `modulos-e-testes.md` | Infra | Gating do módulo farmácia, harness vitest/jg_test e verificação por Playwright |
