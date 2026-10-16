---
expx_schema: 1
expx_tool: sprintx
kind: fechamento
trabalho_id: farmacia-controlados
titulo: Farmacia Fase 2 - medicamentos controlados, antimicrobianos e SNGPC
tipo_trabalho: feature
fechado_em: 2026-10-16
modulo_afetado: [prisma, routes, utils, middlewares, tests, frontend, raiz]
arquivos_alterados: [backend/prisma/migrations/20261017090000_farmacia_controlados/migration.sql, backend/tests/sngpc-modelo.test.ts, backend/prisma/schema.prisma, backend/src/db.ts, backend/tests/sngpc-xml.ts, backend/tests/sngpc-xml.test.ts, backend/package.json, backend/package-lock.json, backend/tests/sngpc-factories.ts, backend/tests/sngpc-factories.test.ts, backend/src/utils/sngpc/regras.ts, backend/tests/sngpc-regras.test.ts, backend/tests/fixtures/sngpc-tipos-receituario.json, backend/tests/sngpc-produto-api.test.ts, backend/src/routes/produtos.ts, backend/tests/sngpc-farmaceutico.test.ts, backend/src/routes/auth.ts, backend/src/middlewares/auth.ts, frontend/produto.html, frontend/configuracoes.html, backend/src/utils/sngpc/receita.ts, backend/tests/sngpc-receita.test.ts, backend/src/utils/sngpc/vendaReceita.ts, backend/tests/sngpc-venda-pdv.test.ts, backend/src/routes/vendas.ts, backend/tests/sngpc-lote-obrigatorio.test.ts, backend/src/utils/fefo.ts, backend/tests/sngpc-venda-prazo.test.ts, backend/src/routes/vendasForaPdv.ts, backend/tests/sngpc-orcamento.test.ts, backend/tests/sngpc-troca.test.ts, backend/src/routes/trocas.ts, backend/tests/sngpc-comprador.test.ts, backend/src/routes/farmacia.ts, frontend/ui/receita.js, frontend/pdv.html, frontend/vendas-fora-pdv.html, frontend/orcamentos.html, backend/tests/sngpc-compra.test.ts, backend/src/routes/compras.ts, backend/tests/sngpc-estoque-manual.test.ts, backend/src/routes/estoque.ts, frontend/compras.html, frontend/estoque.html, backend/src/utils/sngpc/inconsistencias.ts, backend/tests/sngpc-inconsistencia.test.ts, backend/src/utils/sngpc/inventario.ts, backend/tests/sngpc-inventario.test.ts, backend/src/utils/sngpc/xmlVendas.ts, backend/tests/sngpc-xml-vendas.test.ts, backend/src/utils/sngpc/xmlEntradasPerdas.ts, backend/tests/sngpc-xml-entradas-perdas.test.ts, backend/src/utils/sngpc/movimentacao.ts, backend/src/utils/sngpc/pacote.ts, backend/tests/sngpc-movimentacao.test.ts, backend/src/routes/sngpc.ts, backend/tests/sngpc-rotas.test.ts, backend/src/app.ts, backend/tests/sngpc-painel.test.ts, backend/tests/sngpc-livro.test.ts, frontend/sngpc.html, frontend/ui/shell.js, backend/modulos.json, backend/tests/sngpc-ponta-a-ponta.test.ts]
palavras_chave: [sngpc, controlados, portaria-344, antimicrobianos, receita, anvisa, xml, farmacia]
resumo: Produtos controlados e antimicrobianos passam a exigir receita e lote na venda, NF na entrada e motivo na perda, e o RT gera os XML de inventario e movimentacao do SNGPC em zip com MD5
decisao_principal: Sistema gera XML iso-8859-1 compactado em zip e guarda o MD5 do base64; o RT faz upload no portal; sem envio automatico e sem guardar senha do RT
risco_residual: Aceite real no portal SNGPC ainda nao feito (B-01) e XML conferido so contra o Guia v2.3, sem o XSD oficial
testes_adicionados: 53
---

# Fechamento — farmacia-controlados

**Resumo.** O ERP agora escritura medicamentos controlados (Portaria 344) e antimicrobianos (RDC 471) para o SNGPC: cadastro da classe e da lista no produto e do farmacêutico RT no operador; receita obrigatória e validada no PDV, na venda a prazo e na efetivação de orçamento; venda só com saldo em lote; NF e lote na compra e na entrada manual; motivo SNGPC na perda; geração dos XML de inventário e de movimentação (Guia v2.3) em zip com MD5, painel com prazo de 7 dias, livro de escrituração e inconsistências quando uma venda exportada é estornada.

**Decisão principal.** O sistema gera o XML iso-8859-1 compactado em zip e guarda o MD5 do base64; o RT faz o upload no portal — sem envio automático e sem guardar a senha do RT (D-02), porque o webservice está bloqueado por CAPTCHA e a API nova não tem documentação de resposta.

**Risco residual.** O aceite real no portal SNGPC ainda não foi feito (B-01, depende do RT e do CNPJ reais) e o XML foi conferido contra o Guia v2.3, não contra o XSD oficial (download bloqueado). Antes do deploy, aplicar as migrações `20261016120000_farmacia_lote_movimento` e `20261017090000_farmacia_controlados` com `prisma migrate deploy`.
