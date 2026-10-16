# Sprint 06 — Alerta de vencimento

## Objetivo

Exibir os lotes a vencer (e os já vencidos) dentro de um limiar configurável (default 90 dias) no painel de estoque, com o limiar ajustável por admin (D-07, D-14, D-17).

## Fases

| Fase | Título | Roda em paralelo com |
|---|---|---|
| F-06.1 | Endpoint de vencimento e limiar configurável | nenhuma |
| F-06.2 | Tela de alerta de vencimento | nenhuma |

Detalhe de cada fase em `fases.md`; tasks em `tasks.md`.

## Critério de saída

`GET /api/farmacia/vencendo` retorna os lotes já vencidos e os com validade dentro do limiar vigente, e a tela de estoque exibe esses lotes com os dias restantes.

## Riscos conhecidos

- Limiar configurável precisa de chave de setting; a gravação deve ser restrita ao admin (D-14).
- Lotes vencidos hoje não existem como conceito no estoque (`base/estoque.md`); D-17 define que o alerta os inclui.
