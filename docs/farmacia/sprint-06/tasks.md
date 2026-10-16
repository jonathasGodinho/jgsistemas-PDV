# Tasks — Sprint 06

> Um bloco por task. Repita o bloco abaixo para cada task da sprint, preenchendo TODOS os campos — nenhum é opcional. Na execução (F6), a linha `status` é atualizada em cada transição; ao concluir, acrescente data e resultado da suíte.

---

```yaml
id: T-06.01
titulo: Endpoint de lotes a vencer
objetivo: "Criar `GET /api/farmacia/vencendo` que retorna lotes já vencidos e os que vencem dentro do limiar (D-17)."
arquivos:
  cria: []
  altera: [backend/src/routes/farmacia.ts]
teste_integracao: "`GET /api/farmacia/vencendo` retorna lotes com validade menor ou igual a hoje mais o limiar, incluindo os já vencidos."
teste_funcional: Um lote vencendo em 30 dias aparece com limiar 90 e não aparece com limiar 10; um lote já vencido aparece com qualquer limiar.
criterio_aceite: A resposta inclui lotes já vencidos e os que vencem dentro do limiar vigente (D-17).
depende_de: [T-04.02]
paralelizavel: false
status: concluida  # 2026-10-14 — GET /api/farmacia/vencendo lista vencidos + vencendo no limiar (validade <= hoje+limiar, quantidade > 0), ordenado por validade asc; resposta { limiarDias, hoje, lotes[] } · suíte: 15 arquivos / 33 passed · typecheck exit 0 · divergência: criou backend/tests/farmacia-vencimento.test.ts (arquivos.cria não previa); chave do setting = `farmacia_vencimento_dias`; backend/src/routes/farmacia.ts está untracked no git
```

---

```yaml
id: T-06.02
titulo: Limiar de vencimento configurável por admin
objetivo: Persistir o limiar de dias como setting e permitir que apenas o admin o altere.
arquivos:
  cria: []
  altera: [backend/src/routes/farmacia.ts, frontend/configuracoes.html]
teste_integracao: Salvar o limiar persiste o setting e o endpoint de vencimento passa a usá-lo.
teste_funcional: Admin salva dias igual a 60 e o endpoint de vencimento passa a usar 60.
criterio_aceite: O limiar salvo por um admin é o valor usado pelo alerta; usuário não-admin recebe 403.
depende_de: [T-06.01]
paralelizavel: false
status: concluida  # 2026-10-14 — GET/PUT /api/farmacia/vencimento (PUT com requerPermissao('ADMIN'), valida inteiro 0..3650 → 400 se inválido) persiste em Setting; frontend/configuracoes.html ganhou seção "Farmácia" (menu + #f-limiarVencimento + gate ADMIN && moduloOk('farmacia')) · suíte: 15 arquivos / 33 passed · typecheck exit 0 · verificado por navegador (D-19): menu/seção visíveis p/ admin, limiar carregado = 90, salvar 10 → aviso-ok "Alerta de vencimento salvo com sucesso!" · divergência: além do PUT, foi criado GET /api/farmacia/vencimento (não previsto nos docs) para a tela ler o limiar; implementação do frontend feita pelo agente principal (delegação p/ categoria visual-engineering indisponível no ambiente: "Google Generative AI API key is missing")
```

---

```yaml
id: T-06.03
titulo: Tela de alerta de vencimento no estoque
objetivo: Exibir na tela de estoque os lotes a vencer com os dias restantes.
arquivos:
  cria: []
  altera: [frontend/estoque.html]
teste_integracao: A tela consulta o endpoint de vencimento e lista os lotes retornados.
teste_funcional: "Verificação por navegador (D-19): com um lote vencendo em 30 dias, a tela mostra a linha com lote, validade e dias restantes."
criterio_aceite: A tela lista os lotes do endpoint com validade e dias restantes.
depende_de: [T-06.02]
paralelizavel: false
status: concluida  # 2026-10-14 — frontend/estoque.html: card "Alerta de vencimento" (#card-vencimento) com #vencimento-resumo + lista, gated por JG.moduloOk('farmacia') e atualizado no evento jg:modulos; consome GET /api/farmacia/vencendo e mostra badge Vencido/Vence em N dia(s) · suíte: 15 arquivos / 33 passed · typecheck exit 0 · verificado por navegador (D-19) em localhost:4600 com base semeada (lotes L-VENCIDO -5d, L-30DIAS +30d, L-300DIAS +300d, L-ZERADO qtd 0): limiar 90 → "1 vencido(s) · 1 a vencer em até 90 dias" listando exatamente L-VENCIDO e L-30DIAS; após salvar limiar 10 → "1 vencido(s) · 0 a vencer em até 10 dias" listando só L-VENCIDO (L-30DIAS/L-300DIAS/L-ZERADO corretamente excluídos) · divergência: implementação feita pelo agente principal (delegação p/ visual-engineering indisponível no ambiente); o backend restringe alteração do limiar a admin (403), mas o gate visual de não-admin não foi exercitado no navegador (só na suíte)
```
