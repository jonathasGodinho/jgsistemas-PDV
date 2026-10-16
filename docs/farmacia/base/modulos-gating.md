# Módulos e gating SaaS

## Contrato de entrada

- `backend/src/utils/modulos.ts`:
  - `ModuloDef` (`:11`) — definição de módulo.
  - `CATALOGO` (`:24`) — catálogo carregado de `backend/modulos.json`.
  - `TODAS_AS_CHAVES` (`:28`) — todas as chaves de módulo.
  - `liberacaoAtual` (`:41`) — liberação vigente para o tenant.
  - Cache por mtime (o catálogo é relido quando `modulos.json` muda).
- Uso: `moduloAtivo('<chave>')` — ex.: `moduloAtivo('fidelidade')` (`backend/src/routes/vendasForaPdv.ts:326`) e `moduloAtivo('precos')` (via `preco.ts`).
- Catálogo `backend/modulos.json` — chaves vistas: `orcamentos`, `trocas`, `crediario`, `cobranca`, `fidelidade`.

## Contrato de saída

- `moduloAtivo(chave)` retorna booleano conforme liberação do tenant.

## Limites e cotas

- NÃO DOCUMENTADO.

## Erros conhecidos e tratamento

- NÃO DOCUMENTADO (chave inexistente tratada como inativa ou erro — verificar implementação de `liberacaoAtual`).

## Riscos para a nossa implementação

- Se a farmácia for vendida como **módulo** (ex.: `farmacia`), é aqui que se registra a chave em `backend/modulos.json` e se liga/desliga a funcionalidade por tenant.
- Regras legais (PMC, controlados) podem não poder depender de gating de módulo se forem obrigatórias por lei — decisão a tomar na descoberta.

## Fonte

`backend/src/utils/modulos.ts:11`, `:24`, `:28`, `:41`, `backend/modulos.json`, `backend/src/routes/vendasForaPdv.ts:326` — acessado em 2026-10-13
