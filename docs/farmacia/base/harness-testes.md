# Infraestrutura de testes

## Contrato de entrada

- Busca por frameworks/scripts de teste em `backend/package.json` e no repositório:
  - `backend/package.json` declara apenas os scripts `dev` e `typecheck` — não há script `test`.
  - Busca por `jest|vitest|mocha|describe(|it(|test(` em arquivos `*.json` retornou "No matches found".
  - Busca por arquivos `*.test.ts` / `*.spec.ts` não encontrou nenhum.

## Contrato de saída

- Nenhum runner de teste, nenhuma suíte, nenhuma fixture configurada.

## Limites e cotas

- NÃO DOCUMENTADO (não existe ambiente de teste).

## Erros conhecidos e tratamento

- NÃO DOCUMENTADO.

## Riscos para a nossa implementação

- **Risco crítico:** não existe TDD nem infraestrutura de teste. O sprintx exige TDD estrito (F6) — a primeira sprint de execução deve **entregar o harness de teste** (runner + comando + local de fixtures) antes das regras de farmácia.
- Sem rede de segurança, mudanças em `vendas`/`estoque` (FEFO) são de alto risco: qualquer regressão só aparece em produção (PDV real).
- Verificar se `typecheck` cobre o backend; é a única verificação automática disponível hoje.

## Fonte

`backend/package.json`, busca no repositório — acessado em 2026-10-13
