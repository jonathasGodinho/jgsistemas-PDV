# Lacunas

- Inexiste infraestrutura de teste (runner, comando, fixtures) — procurado em `backend/package.json`, em `*.json` (padrões `jest|vitest|mocha|describe(|it(|test(`) e por arquivos `*.test.ts`/`*.spec.ts`. Nada encontrado.
- Não há handler global de erro documentado no `backend/src/server.ts` — procurar na implementação (fora do escopo F1).
- Limites exatos de rate limit (`criarLimiter`) e de payload por rota — não documentados no código lido.
- Valor exato de MVA/redução/ST e regras de tributação monofásica de medicamentos — não existem no código; dependem de fonte externa (CMED/ANVISA/SEFAZ) que pertence a fase futura, não à F1.
- Tabela PMC/CMED e regras de controlados (SNGPC/ANVISA) — fontes externas não ingeridas nesta fase (INTERNO).
