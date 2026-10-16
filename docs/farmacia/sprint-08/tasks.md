# Tasks — Sprint 08

> Um bloco por task. Repita o bloco abaixo para cada task da sprint, preenchendo TODOS os campos — nenhum é opcional. Na execução (F6), a linha `status` é atualizada em cada transição; ao concluir, acrescente data e resultado da suíte.

---

```yaml
id: T-08.01
titulo: PIS/COFINS monofásico para medicamento
objetivo: Ajustar o cálculo de tributos do item para a regra monofásica de medicamentos.
arquivos:
  cria: []
  altera: [backend/src/nfe/icms.ts]
teste_integracao: "`calcImpostoItem` de um medicamento com CST monofásico calcula PIS/COFINS conforme a alíquota cadastrada."
teste_funcional: Um item medicamento retorna tributos iguais aos esperados pela regra monofásica cadastrada.
criterio_aceite: Os valores de PIS/COFINS do item de medicamento seguem a regra monofásica cadastrada.
depende_de: [T-02.02]
paralelizavel: true
status: concluida
concluida_em: 2026-10-14
resultado: "npx vitest run tests/farmacia-fiscal-pis-cofins.test.ts -> 3 passed; suite completa 22 files / 57 passed; npm run typecheck -> exit 0"
divergencias:
  - "backend/src/nfe/xml.ts tambem alterado: o grupo PIS/COFINS passou a ser escolhido pelo CST do item (PISAliq/PISNT/PISOutr e equivalentes do COFINS) - nao previsto em arquivos.altera."
```

---

```yaml
id: T-08.02
titulo: ICMS-ST por produto/NCM (MVA e redução)
objetivo: Persistir MVA/redução por produto e usá-las no cálculo do ICMS-ST do item.
arquivos:
  cria: [backend/prisma/migrations (novo arquivo de migração)]
  altera: [backend/prisma/schema.prisma, backend/src/nfe/icms.ts]
teste_integracao: Um item com ST cadastrado usa a MVA e a redução do produto no cálculo.
teste_funcional: Produto com MVA 40% e redução 0 gera ST igual ao valor esperado pela base de cálculo.
criterio_aceite: O valor de ST do item confere com a MVA e a redução cadastradas no produto.
depende_de: [T-08.01, T-02.02]
paralelizavel: false
status: concluida
concluida_em: 2026-10-14
resultado: "npx vitest run tests/farmacia-fiscal-icms-st.test.ts -> 3 passed; suite completa 22 files / 57 passed; npm run typecheck -> exit 0"
divergencias:
  - "backend/src/nfe/xml.ts tambem alterado: emite o grupo ICMSST (orig, CSOSN, vBCSTRet, pST, vICMSSTRet) quando o item tem ST; sem ST segue ICMSSN."
  - "backend/src/routes/produtos.ts + tests/farmacia-produto-api.test.ts tambem alterados: a API passou a aceitar e retornar mvaSt/reducaoSt (2 testes novos: round-trip 40/10 e rejeicao de 140) - nao previsto em arquivos.altera. A tela frontend/produto.html ainda nao expoe os campos (pendencia registrada)."
  - "ICMSTot.vBCST/vST permanecem 0: os totais de ST nao sao somados no bloco de totais da NFC-e."
```

---

```yaml
id: T-08.03
titulo: NFC-e de medicamento autorizada em homologação
objetivo: Emitir a NFC-e de uma venda com medicamento em ambiente de homologação (config `nfe_config` de homologação + certificado já declarados em ORQUESTRADOR §4) e validar o aceite.
arquivos:
  cria: []
  altera: []
teste_integracao: Emitir NFC-e de uma venda com medicamento em tpAmb de homologação e receber status de autorizada.
teste_funcional: Uma venda de medicamento gera NFC-e com nfeStatus AUTORIZADA em homologação.
criterio_aceite: A NFC-e de medicamento retorna status AUTORIZADA em homologação SEFAZ.
depende_de: [T-08.01, T-08.02]
paralelizavel: false
status: bloqueada
executada_em: 2026-10-14
resultado: "npx vitest run tests/farmacia-fiscal-homologacao.test.ts -> 2 passed; suite completa 22 files / 57 passed; npm run typecheck -> exit 0"
observacao: "Regra 3 (nao existe concluido com ressalva): o criterio de aceite exige AUTORIZADA na SEFAZ real, entao a task fica bloqueada por B-02. Comprovado em ambiente simulado (NFE_CERT_MODE=test + NFE_DRY_RUN=1): AUTORIZADA, chave com 44 digitos, protocolo presente, XML com tpAmb 2, PISNT/COFINSNT e ICMSST (vBCSTRet 140.00 / vICMSSTRet 7.20); Sale.nfeStatus AUTORIZADA e nfeTpAmb 2. O teste 1 cobre o diagnostico sem certificado (422 SEM_CERTIFICADO)."
divergencias:
  - "backend/src/nfe/emissor.ts tambem alterado: criarAssinador() saiu do caminho de excecao - sem certificado a emissao agora registra SEM_CERTIFICADO na propria venda (nfeStatus/nfeError) e responde 422 estruturado, em vez de 500 generico."
  - "Teste usa comEmpresa(companyId, ...) para salvar a nfe_config, porque salvarSetting exige contexto multiempresa."
bloqueio: "B-02 - homologacao real na SEFAZ (certificado A1 real + CSC de homologacao) segue pendente; ver docs/farmacia/00-BLOQUEIOS.md."
```

---

```yaml
id: T-08.04
titulo: Totais de ICMS-ST no bloco total/ICMSTot da NFC-e
objetivo: Fechar a divergencia #3 de T-08.02 (ICMSTot.vBCST/vST sempre 0) aplicando a regra do MOC para ST nos totais da nota.
arquivos:
  cria: []
  altera: [backend/src/nfe/xml.ts, backend/tests/farmacia-fiscal-icms-st.test.ts]
teste_integracao: "Uma NFC-e de item medicamento com CSOSN 500 e ST retido calculado (vBCSTRet 140.00 / vICMSSTRet 7.20) mantem ICMSTot.vBCST e ICMSTot.vST em 0.00."
teste_funcional: O XML da NFC-e nao soma o ST retido do item nos totais da nota.
criterio_aceite: "ICMSTot.vBCST/vST refletem somente o ST proprio (CST 10/30/70/90 e CSOSN 201/202/203/900); na Fase 1, em que toda operacao com ST e CSOSN 500 (ST retido), os totais permanecem 0.00 — regra conferida no MOC (Manual de Orientacao do Contribuinte)."
depende_de: [T-08.02]
paralelizavel: false
status: concluida
concluida_em: 2026-10-14
resultado: "npx vitest run tests/farmacia-fiscal-icms-st.test.ts -> 4 passed; suite completa 22 files / 58 passed; npm run typecheck -> exit 0"
divergencias:
  - "A divergencia #3 de T-08.02 ('ICMSTot.vBCST/vST permanecem 0') NAO era defeito: o MOC manda somar em vBCST/vST apenas o ST proprio (CST 10/30/70/90 e CSOSN 201/202/203/900). Como a Fase 1 so emite ST retido (CSOSN 500, grupo ICMSST do item), os totais ficarem 0 esta correto. O teste foi escrito antes de qualquer alteracao de codigo e passou de primeira (teste de caracterizacao/regressao)."
  - "Nenhuma mudanca de comportamento: a task virou comentario explicativo em backend/src/nfe/xml.ts (acima de criarElemento(doc, icmsTot, 'vBCST', ...)) + 4o teste em tests/farmacia-fiscal-icms-st.test.ts, para impedir que alguem 'corrija' os totais depois."
```

---

```yaml
id: T-08.05
titulo: Campos de MVA e redução de ST na tela de produto
objetivo: Expor na tela de produto os campos de MVA de ST e redução de ST que a API ja aceita desde T-08.02 (fechando a pendencia registrada na divergencia #2 de T-08.02 e no item do §7 do ORQUESTRADOR).
arquivos:
  cria: []
  altera: [frontend/produto.html]
teste_integracao: "Com o modulo farmacia ativo, salvar a tela envia mvaSt/reducaoSt no PUT do produto e reabrir o produto recarrega os valores gravados."
teste_funcional: "Os campos 'MVA de ST (%)' e 'Redução de ST (%)' aparecem na aba Farmácia, carregam o valor do produto e salvam o que foi digitado."
criterio_aceite: "Os dois campos aparecem, salvam e recarregam na tela quando o modulo esta ativo, sem quebrar os campos de farmacia ja existentes (principio ativo, tipo, Registro MS, PMC)."
depende_de: [T-08.02, T-03.02]
paralelizavel: false
status: concluida
concluida_em: 2026-10-14
resultado: "Verificacao por navegador (D-19, playwright) em localhost:4600 com /api/** interceptado: aba Farmacia visivel, rotulos 'MVA de ST (%)' e 'Redução de ST (%)', valores carregados da API 12,50 e 3,50 (PMC 12,34 intacto), alerta do painel citando MVA/reducao e CSOSN 500 (0 a 100); apos digitar 40 e 10 e clicar em salvar, o corpo do PUT levou mvaSt 40 e reducaoSt 10 preservando pmc 12.34, principioAtivo e tipoMedicamento; zero pageerror. Suite: 22 files / 58 passed; npm run typecheck -> exit 0."
divergencias:
  - "A verificacao de tela usou rota /api/** interceptada (page.route) porque nao ha login valido no ambiente de dev (sessao expirada / sem credenciais); a persistencia de mvaSt/reducaoSt e coberta por tests/farmacia-produto-api.test.ts (round-trip 40/10 e rejeicao de 140)."
  - "Achado fora do escopo registrado em B-04: frontend/ui/shell.js:354 usa 'm' fora do try onde foi declarado (ReferenceError) e por isso o evento jg:modulos nao e disparado quando a empresa tem lista de modulos explicita."
```
```
