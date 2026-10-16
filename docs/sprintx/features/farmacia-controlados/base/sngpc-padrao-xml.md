# SNGPC — padrão XML de inventário e movimentação (versão 2.x)

## Contrato de entrada

O sistema da farmácia GERA dois tipos de arquivo XML (Guia SNGPC v2.3, p. 5–6):

**Mensagem de inventário** — raiz `mensagemSNGPCInventario`, namespace `urn:sngpc-schema`, `encoding="iso-8859-1"` (Guia p. 8).
- `cabecalho`: `cnpjEmissor` (14 dígitos), `cpfTransmissor` (CPF do RT), `data` (AAAA-MM-DD). A data do inventário "pode ser correspondente a até 7 dias anteriores à data da transmissão" (Guia p. 6).
- `corpo/medicamentos/entradaMedicamentos/medicamentoEntrada` (repetível): `classeTerapeutica`, `registroMSMedicamento` (13 dígitos no exemplo), `numeroLoteMedicamento`, `quantidadeMedicamento`, `unidadeMedidaMedicamento` (Guia p. 7, regra 1; exemplo p. 8).
- `corpo/insumos/...` só para insumos de manipulação (Guia p. 7, regra 2).

**Mensagem de movimentação** — raiz `mensagemSNGPC` (Guia p. 12).
- `cabecalho`: `cnpjEmissor`, `cpfTransmissor`, `dataInicio`, `dataFim` (período coberto).
- `corpo/medicamentos` contém, nesta ordem (Guia p. 5, Figura 2):
  - `entradaMedicamentos`: `notaFiscalEntradaMedicamento` (`numeroNotaFiscal`, `tipoOperacaoNotaFiscal`, `dataNotaFiscal`, `cnpjOrigem`, `cnpjDestino`) + N `medicamentoEntrada` (`classeTerapeutica`, `registroMSMedicamento`, `numeroLoteMedicamento`, `quantidadeMedicamento`, `unidadeMedidaMedicamento`) + `dataRecebimentoMedicamento` (Guia p. 12).
  - `saidaMedicamentoVendaAoConsumidor`: `tipoReceituarioMedicamento`, `numeroNotificacaoMedicamento`, `dataPrescricaoMedicamento`, `prescritorMedicamento` (`nomePrescritor`, `numeroRegistroProfissional`, `conselhoProfissional`, `UFConselho`), `usoMedicamento`, `compradorMedicamento` (`nomeComprador`, `tipoDocumento`, `numeroDocumento`, `orgaoExpedidor`, `UFEmissaoDocumento`), `pacienteMedicamento` (`nome`, `idade`, `unidadeIdade`, `sexo`, `cid`), N `medicamentoVenda` (`usoProlongado`, `registroMSMedicamento`, `numeroLoteMedicamento`, `quantidadeMedicamento`, `unidadeMedidaMedicamento`), `dataVendaMedicamento` (Guia p. 12–13).
  - `saidaMedicamentoTransferencia`: nota fiscal + N `medicamentoTransferencia` + `dataTransferenciaMedicamento` (Guia p. 13).
  - `saidaMedicamentoPerda`: `motivoPerdaMedicamento` + N `medicamentoPerda` + `dataPerdaMedicamento` (Guia p. 13).
  - Operações de transformação (`entradaMedicamentoTransformacao`, `saidaMedicamentoTransformacao*`) são "aplicável somente para farmácias de manipulação" (Guia p. 9, nota 1).

**Regras de preenchimento** (Guia p. 10–11, seção 4.2):
1. `classeTerapeutica`: 1 = Antimicrobiano; 2 = Sujeito a controle especial (Guia p. 18).
2. Dados do **paciente** obrigatórios quando a classe é antimicrobiano; não obrigatórios para controlado. `cid` ainda não obrigatório.
3. Dados do **comprador** obrigatórios para controlado; não para antimicrobiano.
4. Tipo de receituário 5 = "Receita antimicrobiano em 2 vias"; para ele o número da notificação não é obrigatório.
5. Controlado de uso humano aceita conselhos CRO, CRF, CRM e RMS; uso veterinário só CRMV; receita de antimicrobiano aceita todos (COREN, CRO, CRF, CRM, CRMV, RMS).
6. `usoProlongado` (S/N/nulo) só para antimicrobiano; para controlado deve ser nulo.
7. `quantidadeMedicamento` de venda limitada a 3 caracteres (999) (Guia p. 11, regra 10).

**Tipos enumerados** (Guia p. 18–20):
- `st_TipoReceituario`: 1 Receita de Controle Especial em 2 vias (branca); 2 Notificação de Receita B (azul); 3 Notificação de Receita Especial (branca); 4 Notificação de Receita A (amarela); 5 Receita Antimicrobiano em 2 vias.
- `st_TipoUsoMedicamento`: 1 Humano; 2 Veterinário.
- `st_TipoOperacaoNotaFiscal`: 1 Compra; 2 Transferência; 3 Venda.
- `st_ConselhoProfissional`: COREN, CRM, CRMV, CRO, CRF, RMS.
- `st_TipoMotivoPerda`: 1 Furto/Roubo; 2 Avaria; 3 Vencimento; 4 Apreensão/Recolhimento pela Visa; 5 Perda no processo; 6 Coleta para controle de qualidade; 7 Perda de exclusão da portaria 344; 8 Por desvio de qualidade; 9 Recolhimento do Fabricante.
- `st_UnidadeIdade`: 1 Anos; 2 Meses. `st_Sexo`: 1 Masculino; 2 Feminino.
- `st_UnidadeMedidaMedicamento`: 1 Caixas; 2 Frascos (sngpc-go `sngpc/simple_types.go:300-302`, espelho do XSD oficial).
- `st_TipoDocumento`: 1 Carteira de registro profissional; 2 Carteira de identidade; 4 Pedido de autorização de trabalho; 5 Certidão de nascimento; 6 Certidão de casamento; 7 Certificado de reservista; 8 Carta patente; 10 Certificado de dispensa de incorporação; 11 Identidade do estrangeiro; 13 Passaporte; 14 Protocolo da Polícia Federal; 19 IE; 20 IM; 21/22 Alvará sanitário municipal/estadual; 38 AFE; 39 AE; 40 AE simplificada; 50 CTPS; 62 CNPJ (sngpc-go `simple_types.go:177-198`).
- `st_OrgaoExpedidor`: lista de siglas (SSP, DPF, DIC, CRM, CRF, ... 50+ valores) (sngpc-go `simple_types.go:207-260`).

## Contrato de saída

O XML é transmitido (ver `sngpc-transmissao.md`); a resposta do SNGPC é um texto/estrutura de validação. O formato da resposta está no XSD `sngpcRetorno.xsd` (gov.br/anvisa — Desenvolvedores), não lido: NÃO DOCUMENTADO nesta base.

## Limites e cotas

- Quantidade por item de venda: até 999 (Guia p. 11, regra 10).
- Arquivo deve ser compactado em `.zip`: "Somente serão aceitos arquivos compactados" (Guia p. 18, seção 5).
- Data do inventário: até 7 dias antes da transmissão (Guia p. 6).
- Tamanho máximo de arquivo: NÃO DOCUMENTADO.

## Erros conhecidos e tratamento

- XML fora do schema é rejeitado na validação ("validar a estrutura do XML que deve estar de acordo com os schemas definidos", Manual do Desenvolvedor p. 7). Lista de códigos de erro: NÃO DOCUMENTADO nesta base.

## Riscos para a nossa implementação

- O XSD oficial (`sngpc.anvisa.gov.br/schema/*.xsd`) respondeu com página de bloqueio (Cloudflare) no download automatizado em 2026-10-16 — os enums de unidade, documento e órgão vêm do espelho `sngpc-go`, não do XSD oficial. Validar o XML gerado contra o XSD oficial exige obtê-lo manualmente.
- `unidadeMedidaMedicamento` só tem Caixas/Frascos: o produto precisa saber se é vendido em caixa ou frasco (hoje `Product.unit` é texto livre, default "UN").
- Comprador exige tipo + número de documento + órgão expedidor + UF — hoje `Customer` só tem `document` (texto).
- Entrada exige nota fiscal com número, data, CNPJ origem/destino — hoje `Purchase` não guarda número/data da NF nem CNPJ do fornecedor na compra (`Supplier.document` existe).
- Registro MS do produto (`Product.registroMS`) é obrigatório em todas as operações; produto controlado sem Registro MS não pode ser escriturado.
- Quantidades no SNGPC são em caixas/frascos inteiros; venda fracionada não é coberta pelo exemplo (NÃO DOCUMENTADO).

## Fonte

- Guia para geração do padrão de transmissão SNGPC, versão 2.3 (Anvisa, setembro/2025): https://www.gov.br/anvisa/pt-br/assuntos/fiscalizacao-e-monitoramento/sngpc/informes/GuiaSNGPC.pdf/@@display-file/file — acessado em 2026-10-16
- Espelho dos tipos simples: https://github.com/endersonmaia/sngpc-go/blob/af6df4cb2da4/sngpc/simple_types.go — acessado em 2026-10-16
- Página Desenvolvedores SNGPC: https://www.gov.br/anvisa/pt-br/assuntos/fiscalizacao-e-monitoramento/sngpc/desenvolvedores — acessado em 2026-10-16
