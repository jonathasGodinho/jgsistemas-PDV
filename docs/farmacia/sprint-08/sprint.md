# Sprint 08 — Fiscal monofásico (ICMS-ST e PIS/COFINS)

## Objetivo

Tratar a tributação de medicamentos — monofásico de PIS/COFINS e ICMS-ST com MVA/redução informados manualmente — e validar o aceite da NFC-e de medicamento em homologação SEFAZ (D-06, D-12, base: `fiscal-nfce.md`).

## Fases

| Fase | Título | Roda em paralelo com |
|---|---|---|
| F-08.1 | Tributação de medicamento (monofásico e ST) | nenhuma |
| F-08.2 | NFC-e de medicamento em homologação | nenhuma |

Detalhe de cada fase em `fases.md`; tasks em `tasks.md`.

## Critério de saída

O cálculo de tributos de um item medicamento segue a regra monofásica e a ST cadastradas, e a NFC-e de uma venda de medicamento é autorizada em homologação SEFAZ.

## Riscos conhecidos

- `CSOSN_VALIDOS=['101','102','103','500','900']` não cobre monofásico/ST de medicamento (`docs/farmacia/base/fiscal-nfce.md`) — pode ser preciso ampliar a lista ou cadastrar CST/CSOSN por produto.
- Não há fonte automática de MVA/redução (D-12) — entram manualmente por produto/NCM.
- A emissão em homologação depende de certificado e configuração SEFAZ-AM já existentes (`base/fiscal-nfce.md`); validar antes de assumir acesso.
- O layout é `4.00` (`base/fiscal-nfce.md`) — manter a versão do XML.
