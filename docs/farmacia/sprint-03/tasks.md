# Tasks — Sprint 03

> Um bloco por task. Repita o bloco abaixo para cada task da sprint, preenchendo TODOS os campos — nenhum é opcional. Na execução (F6), a linha `status` é atualizada em cada transição; ao concluir, acrescente data e resultado da suíte.

---

```yaml
id: T-03.01
titulo: Campos de farmácia na API de produtos
objetivo: Aceitar e devolver princípio ativo, tipo, Registro MS e PMC na API de produtos, validando o tipo contra a lista fixa.
arquivos:
  cria: []
  altera: [backend/src/routes/produtos.ts]
teste_integracao: Criar produto com os quatro campos de farmácia e reler pela busca de produtos retorna os mesmos valores.
teste_funcional: Enviar tipo fora da lista fixa (Referência/Genérico/Similar/Outros) resulta em erro 400.
criterio_aceite: "A busca de produtos retorna principioAtivo, tipoMedicamento, registroMS e pmc do produto criado; tipo inválido retorna 400."
depende_de: [T-02.02, T-02.03]
paralelizavel: false
status: concluida  # 2026-10-13 · suíte: 16 passed · typecheck exit 0 · lista fixa de tipos = REFERENCIA/GENERICO/SIMILAR/OUTROS (entrada normalizada p/ maiúsculas)
```

---

```yaml
id: T-03.02
titulo: Tela de produto com campos de farmácia
objetivo: Adicionar os campos de farmácia ao formulário de produto, visíveis somente com o módulo ativo.
arquivos:
  cria: []
  altera: [frontend/produto.html]
teste_integracao: Com o módulo ativo, salvar a tela envia os campos de farmácia e a API persiste.
teste_funcional: "Verificação por navegador (D-19): preencher princípio ativo, tipo, Registro MS e PMC, salvar e recarregar mostra os mesmos valores."
criterio_aceite: Os quatro campos aparecem, salvam e recarregam na tela quando o módulo está ativo.
depende_de: [T-03.01]
paralelizavel: false
status: concluida  # 2026-10-13 · suíte: 18 passed · typecheck exit 0 · navegador (D-19): salvar e reabrir mostram os mesmos valores; aba/painel somem quando jg:modulos não inclui farmacia · divergência: criou backend/tests/farmacia-produto-tela.test.ts (arquivos.cria não previa) e gerou artefatos .playwright-mcp/; os campos só entram no corpo quando moduloOk('farmacia') é verdadeiro
```
