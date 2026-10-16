# Índice da base — farmácia

Arquivos da base de conhecimento da feature (F1 INGESTÃO). Cada linha aponta um arquivo de área/recurso ingerido.

- `arquitetura-servidor.md` — Express/Serverless, entrypoint, middlewares globais e registro de routers.
- `modelo-dados.md` — schema Prisma (44 models), entidades núcleo e ausência de campos de farmácia.
- `cadastro-produtos.md` — API e tela de produto; campos fiscais e pontos de extensão.
- `estoque.md` — posição de estoque, situações e movimentações (sem lote).
- `compras.md` — listagem/detalhe de compras; ponto natural de entrada de lote/validade.
- `vendas-pdv.md` — fluxo de venda no PDV e emissão de NFC-e.
- `vendas-fora-pdv.md` — venda a prazo/crediário; contratos, limites e erros.
- `precos.md` — `precoBaseDe`/`resolverPreco` e gating do módulo `precos`.
- `fiscal-nfce.md` — pacote `nfe/`, ICMS, config, XML, emissão e cancelamento.
- `modulos-gating.md` — catálogo de módulos e gating SaaS.
- `harness-testes.md` — ausência total de infraestrutura de teste (risco crítico).
