# Arquitetura do servidor e roteamento

## Contrato de entrada

- O backend é um app Express montado em `backend/src/server.ts`, exposto como função serverless. O entrypoint de produção é `api/index.ts`, que reaproveita `backend/src/server.ts` (`vercel.json`, chave `functions`).
- Todas as rotas de API vivem sob o prefixo `/api/*`; o `vercel.json` reescreve `/api/:path*` para a função.
- Middlewares globais aplicados no `server.ts`: `autenticar` (JWT/operador), `headersSeguranca` / `bloquearBotsIA` / `protegerInjecao` (segurança), e `criarLimiter` (rate limit) — nomes e ordem em `backend/src/server.ts`.

## Contrato de saída

- Cada domínio é um `Router` registrado no `server.ts`. Routers identificados: `vendas`, `pix`, `produtos`, `categorias`, `clientes`, `estoque`, `financeiro`, `fornecedores`, `funcionarios`, `caixa`, `configuracoes`, `vendasForaPdv`, `auth`, `dashboard`, `relatorios`, `compras`, `marcas`, `colecoes`, `fidelidade`, `auditoria`, `tabelas-preco`, `promocoes`, `trocas`, `inventario`, `crediario` (nomes conforme `backend/src/server.ts`).
- Frontend estático servido de `frontend/` (outputDirectory no `vercel.json`); páginas HTML consomem `/api/*`.

## Limites e cotas

- Rate limit existe via middleware `criarLimiter` (`backend/src/server.ts`) — NÃO DOCUMENTADO o valor exato de janela/máximo de requisições.
- Listagens tendem a limitar com `take` (ex.: `take: 100` em `backend/src/routes/vendasForaPdv.ts:414` e em `backend/src/routes/compras.ts`) — o valor exato por rota NÃO DOCUMENTADO fora dos casos citados.

## Erros conhecidos e tratamento

- NÃO DOCUMENTADO um handler global de erro no `server.ts` (verificar na implementação). Cada router responde `res.status(4xx).json({ erro: "..." })` (padrão observado em `backend/src/routes/vendasForaPdv.ts:401-403`).

## Riscos para a nossa implementação

- Novas rotas de farmácia (ex.: lote/validade, PMC) precisam ser registradas no `server.ts` **e** respeitar os middlewares globais e o prefixo `/api`. Esquecer o registro no `server.ts` deixa a rota inacessível em produção.
- Se o rate limiter global for agressivo, rotas de consulta de preço (PMC) chamadas com frequência podem ser afetadas — confirmar limites antes de desenhar chamadas por item.

## Fonte

`backend/src/server.ts`, `vercel.json`, `api/index.ts`, `backend/src/routes/vendasForaPdv.ts:414` — acessado em 2026-10-13
