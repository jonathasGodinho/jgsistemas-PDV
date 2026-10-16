# Decisões — farmacia

> Uma linha por decisão tomada no planejamento (F2 e, excepcionalmente, F3). Formato fixo. Não apague decisões: uma decisão revertida ganha nova linha que cita a anterior.

## Decisões

```
D-01 | Fase 1 entrega itens 1, 2, 3 e 5: lote/validade com FEFO + alerta de vencimento; princípio ativo e tipo; PMC/CMED com bloqueio de venda acima do teto; fiscal monofásico (ICMS-ST e PIS/COFINS) | reduzir escopo (sem PMC ou sem fiscal) | P-01: conjunto aprovado pelo usuário como primeira entrega
D-02 | Farmácia é um módulo SaaS ligável/desligável por empresa (nova chave em backend/modulos.json, gating por moduloAtivo) | regras sempre ativas quando houver dados farmacêuticos | P-02: empresa que não contrata não vê nem sofre as regras
D-03 | Lote e validade modelados em entidade própria, ligada a Product e à filial (Branch), com validade e quantidade; a baixa FEFO consome os lotes | lote em ProductVariant; lote no Inventory/movimento | P-03: estoque hoje é agregado (Inventory.quantity) e não há rastreio de lote
D-04 | A primeira sprint de execução cria o harness de teste (runner + comando + fixtures) e só depois aplica TDD às regras de farmácia | só typecheck, sem testes automatizados | P-04: não existe infraestrutura de teste; o sprintx exige TDD estrito
D-05 | PMC/CMED entra por upload de planilha CMED (import manual); cada upload substitui a tabela PMC inteira | merge por registro; preview antes de aplicar; digitação manual; API externa | P-05 e P-10: sem novo segredo, apenas o arquivo
D-06 | "Fase 1 pronta" = cadastro com lote/validade + venda com FEFO + alerta de vencimento visível + bloqueio de venda acima do PMC + NFC-e monofásica aceita em homologação SEFAZ | fiscal sem exigir aceite em homologação; pronto = só lote/FEFO/alerta | P-06: definição de pronto do usuário
D-07 | Alerta de vencimento exibido no painel/estoque, com limiar de dias configurável (default 90) e sem notificação externa | e-mail/WhatsApp; apenas relatório sob demanda | P-07: canal e antecedência escolhidos pelo usuário
D-08 | O bloqueio por PMC só ocorre quando o produto TEM PMC cadastrado; sem PMC, a venda segue normal | bloquear medicamento sem PMC; permitir exibindo aviso | P-08: não travar a operação por dado ausente
D-09 | Produto sem lote cadastrado vende normalmente; apenas medicamentos com lote entram em FEFO/alerta (lote vencido não é selecionado pelo FEFO) | exigir lote para medicamento; permitir com aviso | P-09: preservar a operação atual
D-10 | Princípio ativo como texto livre no produto; tipo em lista fixa (Referência / Genérico / Similar / Outros) | catálogo de substâncias; apenas texto sem tipo | P-11: menor complexidade, suficiente para a Fase 1
D-11 | Guardar o Registro MS (ANVISA) no produto e casar as linhas da planilha CMED por Registro MS | casar por código de barras EAN; casar por descrição/princípio ativo | P-12: chave estável para ligar CMED ao produto
D-12 | Regras de ICMS-ST (MVA/redução) são informadas manualmente por produto/NCM (a CMED resolve só o PMC) | tabela própria por NCM/UF; API externa | P-12b: não há fonte automática de ST na Fase 1
D-13 | Medicamentos controlados (Portaria 344 / SNGPC) ficam FORA da Fase 1, na Fase 2 | incluir a flag "controlado" na Fase 1; incluir SNGPC na Fase 1 | P-14: escopo confirmado pelo usuário
D-14 | Ambientes: dev local + produção Vercel; fiscal testado em SEFAZ homologação; nenhum novo segredo (apenas o arquivo CMED); upload da CMED e configuração do limiar restritos ao admin | permitir gerente; permitir qualquer usuário | P-15: ambientes e permissão confirmados
D-15 | Runner de teste = vitest, adicionado ao backend na sprint-01 | Jest ou outro runner | F3: escolha de plano para viabilizar o TDD (D-04); trocar o runner não deve mudar os testes
D-16 | O banco de teste é um Postgres de teste provisionado à parte; o dev fornece `DATABASE_URL` no `backend/.env.test` (não é segredo novo, é mais uma instância) | banco em memória; SQLite; usar o banco de produção | F3/auditoria ALTA-2: sem banco de teste isolado os testes tocam produção nem rodam migração
D-17 | O FEFO NUNCA seleciona lote já vencido; o alerta de vencimento INCLUI lotes já vencidos e os que vencem dentro do limiar | alerta só para a vencer; FEFO inclui vencido | F3/auditoria MÉDIA: remove a ambiguidade do risco da sprint-06 e alinha ao teste de T-06.01
D-18 | A planilha CMED é lida como CSV com as colunas `registroMS`, `descricao`, `pmc` (cabeçalho na primeira linha); linhas sem registroMS ou sem pmc numérico são ignoradas | planilha XLSX; merge parcial no upload | F3/auditoria MÉDIA: fixa o formato para tornar T-07.01 testável
D-19 | Os testes funcionais de frontend (T-03.02, T-06.03) são verificados por navegador (playwright); testes backend rodam por `npm test` (vitest) | exigir vitest para frontend; dispensar teste de frontend | F3/auditoria MÉDIA: o harness backend não executa testes de tela
D-20 | Livro-razão do lote (tabela LoteMovimento): toda mudança de saldo de lote grava uma linha (venda com saleId/saleItemId; estorno com origemId → linha de venda). Cancelamento recompõe exatamente os lotes que a venda consumiu (mesmo vencidos depois); devolução parcial volta aos lotes da venda, a partir da última baixa; nunca estorna além do consumido. Invariante: soma dos lotes ≤ Inventory.quantity (a diferença é o "saldo sem lote"); venda não sai de lote vencido; saída/ajuste manual que desceria abaixo da soma dos lotes baixa os lotes (vencidos primeiro); entrada manual aceita lote/validade; conciliação (GET/POST /api/farmacia/lotes/conciliacao|conciliar) aponta e corrige divergências | ler o lote consumido do texto do InventoryMovement; devolver ao lote de maior validade; não recompor o lote | B-01 (2026-10-16): decisão delegada pelo usuário — "regra onde os dados não se perdem nem deixam de sincronizar"
D-21 | Cancelar orçamento (venda PENDING) não devolve estoque, porque o orçamento nunca baixou estoque | manter a devolução | 2026-10-16: defeito achado ao implementar D-20 — o cancelamento inflava o estoque
```

## Pendências

Nenhuma pendência.
