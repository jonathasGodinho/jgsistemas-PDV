# Cadastro de produtos (API + tela)

## Contrato de entrada

- Rotas em `backend/src/routes/produtos.ts`. Campos fiscais aceitos em `CAMPOS_FISCAIS` (`backend/src/routes/produtos.ts:9-20`): `ncm`, `cest`, `cfop`, `csosn`, `cst`.
- `fiscaisDoCorpo` sanitiza cada campo fiscal removendo o que não for `[0-9A-Za-z.]` e limitando a 12 caracteres (`backend/src/routes/produtos.ts`).
- `fotosDoCorpo` aceita imagens como data URL com limite de 2 MB (`backend/src/routes/produtos.ts`).
- Tela de cadastro: `frontend/produto.html` (404 linhas) — formulário de produto incluindo os campos fiscais.

## Contrato de saída

- `GET /api/produtos` — busca/listagem de produtos (`backend/src/routes/produtos.ts`).
- Produto criado/atualizado persiste os campos fiscais já sanitizados; fotos como data URL.

## Limites e cotas

- Foto: máximo 2 MB por imagem (data URL) (`backend/src/routes/produtos.ts`).
- Campo fiscal: máximo 12 caracteres após sanitização (`backend/src/routes/produtos.ts`).
- Demais limites de payload NÃO DOCUMENTADO.

## Erros conhecidos e tratamento

- NÃO DOCUMENTADO (verificar validações de obrigatoriedade no router).

## Riscos para a nossa implementação

- Os campos de farmácia (princípio ativo, tipo de medicamento, PMC, flag de controlado) não têm entrada nesta API nem na tela `frontend/produto.html`. Será preciso ampliar `CAMPOS_FISCAIS`/payload e o formulário.
- A sanitização de 12 caracteres e remoção de não-alfanuméricos serve para códigos fiscais — **não** deve ser aplicada a textos livres como princípio ativo. Modelar os novos campos fora desse pipeline (ou com tratamento próprio).
- A tela é HTML estático (sem framework observado); mudanças de UI têm custo maior e precisam seguir o padrão dos demais campos.

## Fonte

`backend/src/routes/produtos.ts:9-20` e demais trechos citados, `frontend/produto.html` — acessado em 2026-10-13
