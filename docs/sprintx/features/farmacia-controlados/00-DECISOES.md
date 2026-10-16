---
expx_schema: 1
expx_tool: sprintx
kind: decisoes
trabalho_id: farmacia-controlados
densidade: padrao
modo_construcao: autonomo
atualizado_em: 2026-10-16
decisoes:
  - id: D-00
    decisao: densidade padrao, construcao autonomo
    alternativa_descartada: null
    motivo: confirmado pelo usuario sem sugestao previa (P-00a, P-00b)
    status: fechada
    bloqueante: false
  - id: D-01
    decisao: Escopo inclui medicamentos da Portaria 344/98 (controlados) e antimicrobianos da RDC 471/2021
    alternativa_descartada: So controlados
    motivo: P-02 resposta do usuario; SNGPC cobre as duas classes
    status: fechada
    bloqueante: false
  - id: D-02
    decisao: Sistema gera XML iso-8859-1 compactado em zip e guarda o MD5 do base64; o RT faz upload no portal; sem envio automatico e sem guardar senha do RT
    alternativa_descartada: Envio automatico pela API REST; os dois
    motivo: P-01 resposta do usuario; base sngpc-transmissao (CAPTCHA no SOAP, API sem doc de resposta)
    status: fechada
    bloqueante: false
  - id: D-03
    decisao: Pronto = venda com receita + XML de inventario e de movimentacao gerados, cobertos por testes e aceitos no upload real do portal SNGPC pelo RT; sem RT/CNPJ real fica pronto em simulacao com bloqueio registrado
    alternativa_descartada: Validacao local no XSD; conformidade ao Guia por testes
    motivo: P-03 resposta do usuario
    status: fechada
    bloqueante: false
  - id: D-04
    decisao: Receita vencida bloqueia a venda (30 dias tipos 1 a 4; 10 dias tipo 5); quantidade acima do maximo opcional do produto so alerta e exige confirmacao registrada na receita
    alternativa_descartada: Bloquear as duas; so alertar
    motivo: P-04 resposta do usuario
    status: fechada
    bloqueante: false
  - id: D-05
    decisao: Cancelamento ou devolucao de venda SNGPC ja exportada e permitido, recompoe estoque e lote (D-20 Fase 1) e gera inconsistencia pendente para o RT notificar (RDC 22 art 14); antes da exportacao a venda cancelada simplesmente nao entra no XML
    alternativa_descartada: Bloquear apos exportar; permitir sem aviso
    motivo: P-05 resposta do usuario
    status: fechada
    bloqueante: false
  - id: D-06
    decisao: So usuario marcado farmaceutico RT (com CPF, CRF e UF do CRF) gera arquivos SNGPC e ve relatorios com receita, paciente e comprador; o caixa so registra a receita na venda
    alternativa_descartada: RT e Administrador
    motivo: P-06 resposta do usuario; RDC 22 arts 18 e 21
    status: fechada
    bloqueante: false
  - id: D-07
    decisao: Product ganha classeSngpc (CONTROLADO ou ANTIMICROBIANO ou nulo), listaPortaria344 (A1 a C5, so controlado), unidadeSngpc (1 caixa, 2 frasco; padrao 1) e qtdMaxReceita opcional; classe preenchida exige registroMS
    alternativa_descartada: Tabela fixa de substancias no codigo
    motivo: pesquisa base sngpc-padrao-xml e modelo-dados-atual; confirmada em bloco pelo usuario na revisao de 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-08
    decisao: Tipo de receituario derivado do produto - A1 A2 A3 para 4, B1 B2 para 2, C2 C3 para 3, C1 C4 C5 para 1, antimicrobiano para 5
    alternativa_descartada: Operador escolhe o tipo
    motivo: pesquisa base regulacao-controlados e st_TipoReceituario do Guia p19; confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-09
    decisao: Produto com classeSngpc so vende com saldo em lote suficiente e nao vencido (sem saldo sem lote); demais produtos seguem D-09 da Fase 1
    alternativa_descartada: Vender controlado sem lote
    motivo: pesquisa base sngpc-padrao-xml (lote obrigatorio em todas as operacoes); confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-10
    decisao: Tabela Receita por venda (tipo, numero, data da prescricao, prescritor nome conselho numero UF, uso, comprador nome tipoDoc numero orgao UF, paciente nome idade unidadeIdade sexo cid, quantidadeConfirmada) e SaleItem.receitaId; uma venda pode ter varias receitas; obrigatoriedade segundo Guia 4.2
    alternativa_descartada: Receita gravada no Customer ou em notes da venda
    motivo: pesquisa base sngpc-padrao-xml e modelo-dados-atual; confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-11
    decisao: Receita exigida no PDV e na venda a prazo ao vender item SNGPC; orcamento so exige na efetivacao; troca nao aceita item novo SNGPC
    alternativa_descartada: Exigir receita no orcamento; aceitar receita na troca
    motivo: pesquisa base fluxos-venda-estoque; confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-12
    decisao: XML de movimentacao derivado do LoteMovimento do periodo - VENDA para saidaMedicamentoVendaAoConsumidor agrupada por receita, ENTRADA_COMPRA para entradaMedicamentos com NF, saidas manuais e ajustes negativos para saidaMedicamentoPerda; vendas canceladas antes da exportacao ficam de fora
    alternativa_descartada: Montar a movimentacao a partir de Sale e InventoryMovement
    motivo: pesquisa base fluxos-venda-estoque e D-20 Fase 1; confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-13
    decisao: Purchase ganha nfNumero e nfData; receber compra com item SNGPC exige NF e CNPJ do fornecedor; cnpjDestino e o CNPJ da filial ou da empresa; tipoOperacaoNotaFiscal 1
    alternativa_descartada: Escriturar entrada sem NF
    motivo: pesquisa base sngpc-padrao-xml (notaFiscalEntradaMedicamento) e modelo-dados-atual; confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-14
    decisao: Para produto SNGPC - saida manual e ajuste para baixo exigem motivo st_TipoMotivoPerda 1 a 9; entrada manual exige NF; ajuste para cima e bloqueado
    alternativa_descartada: Motivo livre como hoje
    motivo: pesquisa base sngpc-padrao-xml (saidaMedicamentoPerda) e fluxos-venda-estoque; confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-15
    decisao: XML de inventario gerado do saldo dos lotes de produtos SNGPC na data informada (ate 7 dias atras); geracao bloqueada com lista de pendencias se houver saldo sem lote ou produto SNGPC sem registroMS
    alternativa_descartada: Inventario digitado a mao
    motivo: pesquisa base sngpc-padrao-xml (Guia p6 e p7); confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-16
    decisao: Tabela SngpcArquivo (tipo, filial, dataInicio, dataFim, hash, xml, criadoPor, status GERADO ou ENVIADO); periodos de movimentacao continuos a partir do ultimo fim; painel avisa quando passar de 7 dias sem arquivo; RT marca enviado
    alternativa_descartada: Sem historico de arquivos
    motivo: pesquisa base regulacao-controlados (RDC 22 art 10 par 3 e art 19); confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-17
    decisao: Compactacao zip com a biblioteca fflate (dependencia nova) e codificacao latin1 nativa do Node
    alternativa_descartada: adm-zip; jszip
    motivo: pesquisa base modulos-e-testes (nao ha lib de zip no backend); confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-18
    decisao: cnpjEmissor = Branch.document ou Company.document; cpfTransmissor = CPF do usuario RT que gera o arquivo
    alternativa_descartada: CNPJ sempre da matriz
    motivo: pesquisa base sngpc-padrao-xml e modelo-dados-atual; confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-19
    decisao: Auditoria (registrarAuditoria) ao registrar receita, gerar arquivo, marcar enviado e abrir inconsistencia; painel SNGPC mostra ultimo arquivo, dias desde o ultimo e pendencias
    alternativa_descartada: Metricas externas
    motivo: padrao do projeto (utils/auditoria); confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-20
    decisao: Geracao sincrona; dado faltante devolve 422 com a lista de pendencias e nao gera arquivo
    alternativa_descartada: Gerar arquivo parcial
    motivo: pesquisa base sngpc-transmissao (XML fora do schema e rejeitado); confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-21
    decisao: Nenhum segredo e nenhuma variavel de ambiente nova; tudo atras do modulo farmacia existente
    alternativa_descartada: Modulo novo sngpc
    motivo: D-02 e D-14 da Fase 1; confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-22
    decisao: Testes conferem a estrutura e os valores do XML contra o Guia v2.3 (parse com xmldom); o aceite real no portal e verificacao externa do RT
    alternativa_descartada: Validacao XSD automatizada
    motivo: lacuna do XSD bloqueado (base 00-LACUNAS); confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-23
    decisao: Ao digitar o documento do comprador, o sistema pre-preenche com a ultima receita do mesmo documento; Customer nao e alterado
    alternativa_descartada: Gravar comprador no cadastro de cliente
    motivo: base modelo-dados-atual (Customer sem tipo e orgao do documento); confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-24
    decisao: Quantidade SNGPC = SaleItem.quantity em embalagens (caixa ou frasco), maximo 999 por item
    alternativa_descartada: Venda fracionada
    motivo: Guia p11 regra 10 e quantidade Int no schema; confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-25
    decisao: Conselhos aceitos - uso humano de controlado CRO CRF CRM RMS; uso veterinario so CRMV; antimicrobiano COREN CRO CRF CRM CRMV RMS; numero da notificacao opcional no tipo 5
    alternativa_descartada: Qualquer conselho
    motivo: Guia p10 e p11 regras 5 a 7; confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-26
    decisao: Lista da Portaria 344 do produto e cadastro manual editavel; nao ha importacao da lista oficial
    alternativa_descartada: Importar a lista oficial
    motivo: lacuna da lista vigente (base 00-LACUNAS) e listas mudam por RDC; confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-27
    decisao: Fora desta entrega - SNCR e receita eletronica, transferencia entre estabelecimentos (art 13), manipulacao e insumos, balanco trimestral e anual a Visa, regras de GLP-1, venda fracionada
    alternativa_descartada: Incluir algum desses
    motivo: base regulacao-controlados (SNCR sem acesso para farmacias) e sngpc-padrao-xml (transformacao so manipulacao); confirmada em bloco 2026-10-16
    status: fechada
    bloqueante: false
  - id: D-28
    decisao: Contrato de dados exato da migracao T-01.01 e o da secao Contratos C-01 deste arquivo
    alternativa_descartada: Deixar os nomes de campo para a execucao
    motivo: F3 - fixar nomes evita decisao humana na F6 (regra 7); derivado de D-05 D-06 D-07 D-10 D-13 D-14 D-16
    status: fechada
    bloqueante: false
  - id: D-29
    decisao: Contrato de API da receita na venda e o da secao Contratos C-02 deste arquivo
    alternativa_descartada: Receita embutida em cada item
    motivo: F3 - uma receita cobre varios itens (Guia p12, um bloco de venda com N medicamentoVenda); derivado de D-10 e D-11
    status: fechada
    bloqueante: false
  - id: D-30
    decisao: Excecao a D-06 - a rota de pre-preenchimento do comprador devolve so dados do comprador (nunca paciente nem prescritor) a qualquer operador autenticado
    alternativa_descartada: Restringir o pre-preenchimento ao RT
    motivo: F3 apos auditoria BAIXA - o caixa registra a receita (D-06) e precisa do pre-preenchimento (D-23); quem digita o documento ja esta com o comprador no balcao
    status: fechada
    bloqueante: false
---

# Decisões — farmacia-controlados

> Uma linha por decisão. Formato: `D-NN | decisão | alternativa descartada | motivo`. Densidade `padrao`, construção `autonomo`. As decisões D-07 a D-27 foram propostas por pesquisa e confirmadas em bloco pelo usuário na revisão do resumo em 2026-10-16.

## Decisões

```
D-00 | densidade padrao, construcao autonomo | — | P-00a/P-00b: escolha do usuario
D-01 | Controlados (Portaria 344/98) + antimicrobianos (RDC 471/2021) | so controlados | P-02: usuario; o SNGPC cobre as duas classes
D-02 | Gerar XML (iso-8859-1) zipado + MD5 do base64; RT faz upload no portal; sem envio automatico e sem senha do RT | API REST automatica; os dois | P-01: usuario; base/sngpc-transmissao.md (CAPTCHA no SOAP, API sem doc)
D-03 | Pronto = venda com receita + XML de inventario e movimentacao gerados, testados e aceitos no upload real pelo RT; sem RT/CNPJ real = pronto em simulacao com bloqueio | XSD local; conformidade ao Guia | P-03: usuario
D-04 | Receita vencida bloqueia (30 dias tipos 1-4; 10 dias tipo 5); quantidade acima do maximo do produto so alerta e exige confirmacao registrada | bloquear as duas; so alertar | P-04: usuario
D-05 | Estorno de venda SNGPC ja exportada e permitido, recompoe estoque/lote (D-20 F1) e abre inconsistencia para o RT (RDC 22 art. 14); antes de exportar a venda cancelada nao entra no XML | bloquear; sem aviso | P-05: usuario
D-06 | So o usuario farmaceutico RT (CPF, CRF, UF) gera arquivos e ve dados de receita/paciente/comprador; o caixa so registra a receita | RT + Administrador | P-06: usuario; RDC 22 arts. 18 e 21
D-07 | Product: classeSngpc, listaPortaria344 (A1..C5), unidadeSngpc (1 caixa/2 frasco), qtdMaxReceita opcional; classe exige registroMS | tabela fixa no codigo | base/sngpc-padrao-xml.md, base/modelo-dados-atual.md; confirmada em bloco
D-08 | Tipo de receituario derivado: A1-A3→4, B1-B2→2, C2-C3→3, C1/C4/C5→1, antimicrobiano→5 | operador escolhe | base/regulacao-controlados.md; Guia p.19; confirmada em bloco
D-09 | Produto SNGPC so vende com saldo em lote nao vencido suficiente | vender sem lote | base/sngpc-padrao-xml.md (lote obrigatorio); confirmada em bloco
D-10 | Tabela Receita + SaleItem.receitaId; varias receitas por venda; obrigatoriedade pelo Guia 4.2 | receita no Customer/notes | base/sngpc-padrao-xml.md; confirmada em bloco
D-11 | Receita no PDV e na venda a prazo; orcamento so na efetivacao; troca nao aceita item novo SNGPC | receita no orcamento; receita na troca | base/fluxos-venda-estoque.md; confirmada em bloco
D-12 | Movimentacao derivada do LoteMovimento: VENDA→venda ao consumidor por receita; ENTRADA_COMPRA→entrada com NF; saidas/ajustes negativos→perda; cancelada antes de exportar fica fora | Sale/InventoryMovement | base/fluxos-venda-estoque.md, D-20 F1; confirmada em bloco
D-13 | Purchase.nfNumero/nfData; receber item SNGPC exige NF + CNPJ do fornecedor; destino = CNPJ filial/empresa; operacao 1 | entrada sem NF | base/sngpc-padrao-xml.md; confirmada em bloco
D-14 | Produto SNGPC: saida/ajuste para baixo exigem motivo 1-9; entrada manual exige NF; ajuste para cima bloqueado | motivo livre | base/sngpc-padrao-xml.md; confirmada em bloco
D-15 | Inventario do saldo dos lotes SNGPC na data (ate 7 dias atras); bloqueia com pendencias se houver saldo sem lote ou produto sem registroMS | inventario digitado | Guia p.6-7; confirmada em bloco
D-16 | SngpcArquivo (tipo, filial, periodo, hash, xml, criadoPor, status GERADO/ENVIADO); periodos continuos; aviso >7 dias; RT marca enviado | sem historico | RDC 22 art. 10 §3º e art. 19; confirmada em bloco
D-17 | zip com fflate (dependencia nova); latin1 nativo do Node | adm-zip; jszip | base/modulos-e-testes.md; confirmada em bloco
D-18 | cnpjEmissor = Branch.document ?? Company.document; cpfTransmissor = CPF do RT que gera | sempre a matriz | base/sngpc-padrao-xml.md; confirmada em bloco
D-19 | Auditoria em receita, arquivo, enviado e inconsistencia; painel SNGPC com ultimo arquivo, dias e pendencias | metricas externas | padrao utils/auditoria; confirmada em bloco
D-20 | Geracao sincrona; dado faltante → 422 com pendencias, sem arquivo | arquivo parcial | base/sngpc-transmissao.md; confirmada em bloco
D-21 | Nenhum segredo/variavel nova; tudo no modulo farmacia | modulo novo | D-02/D-14 da Fase 1; confirmada em bloco
D-22 | Testes conferem estrutura e valores do XML contra o Guia v2.3 (xmldom); aceite no portal e verificacao externa do RT | XSD automatizado | base/00-LACUNAS.md; confirmada em bloco
D-23 | Documento do comprador pre-preenche com a ultima receita do mesmo documento; Customer nao muda | gravar no Customer | base/modelo-dados-atual.md; confirmada em bloco
D-24 | Quantidade SNGPC = SaleItem.quantity em embalagens, max 999 por item | fracionado | Guia p.11 regra 10; confirmada em bloco
D-25 | Conselhos: humano controlado CRO/CRF/CRM/RMS; veterinario CRMV; antimicrobiano todos; numero opcional no tipo 5 | qualquer conselho | Guia p.10-11; confirmada em bloco
D-26 | Lista da Portaria 344 por produto e cadastro manual editavel | importar lista oficial | base/00-LACUNAS.md; confirmada em bloco
D-27 | Fora: SNCR, transferencia (art. 13), manipulacao/insumos, balanco a Visa, GLP-1, fracionado | incluir | base/regulacao-controlados.md, base/sngpc-padrao-xml.md; confirmada em bloco
D-28 | Contrato de dados da migracao = secao C-01 abaixo | nomes decididos na execucao | F3: evita decisao humana na F6; derivado de D-05/06/07/10/13/14/16
D-29 | Contrato de API da receita na venda = secao C-02 abaixo | receita embutida em cada item | F3: uma receita cobre N itens (Guia p.12); derivado de D-10/D-11
D-30 | Excecao a D-06: pre-preenchimento devolve so dados do comprador a qualquer operador autenticado | so RT | F3 pos-auditoria: o caixa registra a receita (D-06) e precisa do pre-preenchimento (D-23)
```

## Pendências

Nenhuma pendência.

## Contratos fixados na F3

### C-01 — Dados (migração `farmacia_controlados`, T-01.01)

| Modelo | Campo | Tipo Prisma | Regra |
|---|---|---|---|
| Product | `classeSngpc` | `String?` | `CONTROLADO` \| `ANTIMICROBIANO` \| null |
| Product | `listaPortaria344` | `String?` | `A1` `A2` `A3` `B1` `B2` `C1` `C2` `C3` `C4` `C5`; só com `CONTROLADO` |
| Product | `unidadeSngpc` | `Int @default(1)` | 1 caixa, 2 frasco |
| Product | `qtdMaxReceita` | `Int?` | alerta D-04 |
| User | `farmaceuticoRT` | `Boolean @default(false)` | D-06 |
| User | `cpf`, `crf`, `crfUf` | `String?` | CPF só dígitos (11) |
| Purchase | `nfNumero` | `String?` | D-13 |
| Purchase | `nfData` | `DateTime?` | D-13 |
| SaleItem | `receitaId` | `String?` | FK `Receita.id`, `onDelete: SetNull` |
| LoteMovimento | `motivoPerda` | `Int?` | st_TipoMotivoPerda 1–9 |
| LoteMovimento | `nfNumero`, `cnpjOrigem` | `String?` | entrada SNGPC |
| LoteMovimento | `nfData` | `DateTime?` | entrada SNGPC |
| Receita (nova) | `id`, `companyId`, `saleId` | `String` | FK Sale `onDelete: Cascade`; Company `Cascade`; entra em `DIRETAS` |
| Receita | `tipoReceituario`, `uso` | `Int` | st_TipoReceituario 1–5; st_TipoUsoMedicamento 1–2 |
| Receita | `numero` | `String?` | opcional só no tipo 5 |
| Receita | `dataPrescricao` | `DateTime` | |
| Receita | `prescritorNome`, `prescritorConselho`, `prescritorNumero`, `prescritorUf` | `String` | conselhos D-25 |
| Receita | `compradorNome`, `compradorDocumento`, `compradorOrgao`, `compradorUf` | `String?` | obrigatórios em CONTROLADO |
| Receita | `compradorTipoDoc` | `Int?` | st_TipoDocumento |
| Receita | `pacienteNome`, `pacienteCid` | `String?` | nome obrigatório em ANTIMICROBIANO |
| Receita | `pacienteIdade`, `pacienteUnidadeIdade`, `pacienteSexo` | `Int?` | obrigatórios em ANTIMICROBIANO |
| Receita | `quantidadeConfirmada` | `Boolean @default(false)` | D-04 |
| Receita | `createdAt` | `DateTime @default(now())` | índices `[saleId]`, `[companyId, compradorDocumento]` |
| SngpcArquivo (nova) | `id`, `companyId`, `branchId`, `tipo` | `String` | `tipo` = `INVENTARIO` \| `MOVIMENTACAO`; entra em `DIRETAS` |
| SngpcArquivo | `dataInicio`, `dataFim` | `DateTime` | inventário: as duas = data do inventário |
| SngpcArquivo | `hash` | `String` | MD5 hex do base64 |
| SngpcArquivo | `xml`, `zipBase64` | `String @db.Text` | |
| SngpcArquivo | `status` | `String @default("GERADO")` | `GERADO` \| `ENVIADO` |
| SngpcArquivo | `criadoPorId` | `String` | |
| SngpcArquivo | `enviadoEm`, `enviadoPorId`, `observacao` | opcionais | |
| SngpcArquivo | `createdAt` | `DateTime @default(now())` | índice `[companyId, branchId, tipo, dataFim]` |
| SngpcInconsistencia (nova) | `id`, `companyId`, `branchId`, `descricao` | `String` | entra em `DIRETAS` |
| SngpcInconsistencia | `saleId`, `arquivoId` | `String?` | |
| SngpcInconsistencia | `status` | `String @default("ABERTA")` | `ABERTA` \| `NOTIFICADA` |
| SngpcInconsistencia | `createdAt`, `resolvidaEm`, `resolvidaPorId` | `DateTime @default(now())` / opcionais | |

### C-02 — API da receita na venda (T-03.02 em diante)

Corpo de `POST /api/vendas`, `POST /api/vendas-fora-pdv` e `POST /api/vendas/:id/efetivar`:

```
receitas: [ { numero?, dataPrescricao: "AAAA-MM-DD", uso: 1|2,
              prescritor: { nome, conselho, numero, uf },
              comprador?: { nome, tipoDocumento, documento, orgaoExpedidor, uf },
              paciente?: { nome, idade, unidadeIdade, sexo, cid? },
              quantidadeConfirmada?: boolean } ]
itens: [ { codigo, quantidade, receita?: <índice em receitas> } ]      (efetivar: itensReceita: { <saleItemId>: <índice> })
```

- `tipoReceituario` NÃO vem no corpo: é derivado do produto (D-08). Itens de uma mesma receita precisam ter o mesmo tipo derivado.
- Erros: `400 { erro }`; alerta não confirmado: `400 { erro, codigo: "QTD_ACIMA_MAXIMO", itens: [...] }`.
- `GET /api/produtos/:codigo` passa a devolver `classeSngpc`, `listaPortaria344`, `unidadeSngpc`, `qtdMaxReceita` e `tipoReceituario` (derivado).
- Rotas do RT: prefixo `/api/farmacia/sngpc` (`backend/src/routes/sngpc.ts`), protegidas por `autenticar` + `requerFarmaceuticoRT`.
