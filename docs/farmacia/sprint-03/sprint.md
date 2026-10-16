# Sprint 03 — Cadastro de produto de farmácia

## Objetivo

Permitir cadastrar e ler os campos de farmácia do produto (princípio ativo, tipo, Registro MS, PMC) pela API e pela tela, visíveis apenas quando o módulo `farmacia` está ativo (D-10, D-11, D-02).

## Fases

| Fase | Título | Roda em paralelo com |
|---|---|---|
| F-03.1 | API de produtos (campos de farmácia) | nenhuma |
| F-03.2 | Tela de cadastro de produto | nenhuma |

Detalhe de cada fase em `fases.md`; tasks em `tasks.md`.

## Critério de saída

Criar um produto com princípio ativo, tipo, Registro MS e PMC via API e reler o registro traz os quatro campos com os mesmos valores, e a tela salva e recarrega esses campos.

## Riscos conhecidos

- A API sanitiza campos fiscais removendo não-alfanuméricos e limitando a 12 caracteres (`docs/farmacia/base/cadastro-produtos.md`) — essa sanitização NÃO deve ser aplicada a princípio ativo (texto livre).
- `frontend/produto.html` é HTML estático (sem framework observado) — as mudanças seguem o padrão dos campos existentes.
- A visibilidade dos campos depende do estado do módulo, exposto por `/api/farmacia/status` (`base/modulos-gating.md`).
