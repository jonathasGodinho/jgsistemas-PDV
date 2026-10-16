# Harness de testes — como usar

Guia do ambiente de teste do backend do JG Sistemas (sprint-01 da feature `farmacia`).

## Pré-requisito: banco de teste (D-16)

A suíte **nunca** toca a produção. Ela roda contra um Postgres separado, apontado por
`backend/.env.test`:

```
DATABASE_URL="postgresql://<usuario>:<senha>@<host>:<porta>/jg_test?schema=public"
```

Esse arquivo é ignorado pelo Git (`.gitignore: .env*`) e precisa conter `jg_test` no nome do
banco — o setup recusa rodar contra outro banco.

## Rodar a suíte

```
cd backend
npm test
```

- `npm test` = `vitest run` (uma passada, sem watch).
- `npm run typecheck` = `tsc --noEmit`.

O `tests/setup.ts` roda uma vez antes da suíte (`globalSetup`), carrega o `DATABASE_URL` de
`.env.test` e **recria o schema do banco de teste** (reset). Depois disso os testes rodam.

## Onde ficam as coisas

| Caminho | Papel |
|---|---|
| `tests/setup.ts` | `globalSetup`: carrega `.env.test` e prepara o banco. |
| `tests/factories.ts` | Factories `criarCompany`, `criarBranch`, `criarUser`, `criarProduto` + `prisma` (cliente cru). |
| `tests/fixtures/` | Arquivos de apoio (ex.: `cmed.csv`, formato D-18). |
| `tests/*.test.ts` | Os testes. |

## Como criar um novo teste

1. Crie `tests/<assunto>.test.ts`.
2. Importe o que precisar de `./factories` (o `prisma` cru e as factories) e de `vitest`.
3. Escreva o teste. Se ele usa banco, crie os dados com uma factory dentro do próprio teste.
   O banco é recriado a cada execução, então não há estado prévio a limpar.

Exemplo:

```ts
import { describe, expect, it, afterAll } from 'vitest';
import { prisma, criarCompany, criarProduto } from './factories';

afterAll(async () => { await prisma.$disconnect(); });

it('exemplo', async () => {
  const company = await criarCompany();
  const produto = await criarProduto(company.id);
  const lido = await prisma.product.findUnique({ where: { id: produto.id } });
  expect(lido?.companyId).toBe(company.id);
});
```

## Regras

- Use as factories para semear; nunca escreva SQL cru nem dependa de dados "que já existem".
- Um teste por arquivo novo de comportamento; nome do arquivo `*.test.ts`.
- Em tarefas que testam endpoint HTTP, importe o `app` (não o `server`) — ver T-01.05 e
  `tests/http.ts`.
