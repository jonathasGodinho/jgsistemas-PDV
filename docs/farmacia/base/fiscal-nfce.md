# Fiscal / NFC-e

## Contrato de entrada

- Pacote em `backend/src/nfe/` (14 arquivos): `sefaz.ts`, `cert.ts`, `xmldom.d.ts`, `xml.ts`, `xml-crypto.d.ts`, `types.ts`, `qrcode.ts`, `parse.ts`, `index.ts`, `icms.ts`, `eventos.ts`, `emissor.ts`, `config.ts`, `chave.ts`.
- Barrel `backend/src/nfe/index.ts` reexporta o pacote e expõe `emitirNfce`, `carregarVenda`, `cancelarNfce` e os tipos `NfeConfig`, `Emitente`, `Destinatario`, `ItemFiscal`, `PagamentoFiscal`, `VendaFiscal`, `Totais`, `VendaCompleta`, `ResultadoEmissao` (`backend/src/nfe/index.ts:1-21`).
- Configuração: `NFE_CONFIG_KEY='nfe_config'` (`backend/src/nfe/config.ts:6`); QR Code homemologação/produção SEFAZ-AM (`config.ts:7-8`); `CFOP_PADRAO='5102'` e `CSOSN_PADRAO='102'` (`config.ts:10-11`); funções `obterNfeConfig`/`salvarNfeConfig`/`urlQrCode`.
- ICMS: `CSOSN_VALIDOS=['101','102','103','500','900']` (`icms.ts:4`); `arredondar` (`:6`); `calcImpostoItem` (`:17`); `mapTPag` (`:53`).
- XML: `NS`/`VERSAO='4.00'`; `validarDadosFiscais` (`xml.ts:42`); `inserirQrCode`/`montarNfce` (`backend/src/nfe/xml.ts`).
- Emissão: `carregarVenda` (`emissor.ts:28`) carrega a venda; monta, assina (`cert`) e envia via `sefaz`.
- Eventos: `cancelarNfce(saleId, justificativa)` (`eventos.ts:11`).

## Contrato de saída

- `emitirNfce(saleId)` e `cancelarNfce(...)` retornam `ResultadoEmissao`: `{ ok, status, chave?, protocolo?, mensagem?, xmlRetorno? }` (`backend/src/nfe/types.ts`, uso em `eventos.ts:98-105`).
- Cancelamento grava `NfeEvent` e atualiza `Sale.nfeStatus` para `CANCELADA`/`ERRO_EVENTO` (`eventos.ts:77-96`).

## Limites e cotas

- Justificativa de cancelamento: mínimo 15 caracteres (`backend/src/nfe/eventos.ts:18-24`).
- Só NFC-e autorizada pode ser cancelada (`eventos.ts:29-35`).
- Versão do layout: `4.00` (`xml.ts`).

## Erros conhecidos e tratamento

- Emissão desativada → `{ ok:false, status:'DESATIVADO' }` (`eventos.ts:13-15`).
- Justificativa curta → `{ ok:false, status:'JUSTIFICATIVA' }` (`eventos.ts:18-24`).
- Sem empresa / sem chave ou protocolo → `SEMEMPRESA` / `SEMPROTOCOLO` (`eventos.ts:38-44`).
- Falha de assinatura → `ERRO_ASSINATURA` (`eventos.ts:63-66`); falha de transmissão → `ERRO_TRANSMISSAO` (`eventos.ts:106-109`).
- Cancelamento aceito quando `cStat` do evento é `135` ou `136` (`eventos.ts:75`).

## Riscos para a nossa implementação

- Monofásico (medicamentos): `CSOSN_VALIDOS` e `calcImpostoItem` não contemplam as regras de tributação monofásica (PIS/COFINS de medicamento) nem ICMS-ST de medicamento. É preciso estender `calcImpostoItem`/CSOSN e a base de PIS/COFINS.
- `CST`/`CSOSN` de medicamento e ST exigem tabelas de MVA/redução — NÃO DOCUMENTADO no código; provavelmente dado de cadastro + regra nova.
- A emissão roda após a venda; qualquer bloqueio de PMC/controlado deve ser **antes** da emissão.

## Fonte

`backend/src/nfe/*` (arquivos e linhas citados) — acessado em 2026-10-13
