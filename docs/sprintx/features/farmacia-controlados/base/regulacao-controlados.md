# Regulação — escrituração (RDC 22/2014), receituários (Portaria 344/98), antimicrobianos (RDC 471/2021) e SNCR

## Contrato de entrada

**Escrituração (RDC 22/2014):**
- Escriturar "toda e qualquer movimentação e o controle do estoque" dos medicamentos sujeitos à resolução, por sistema informatizado compatível com o padrão Anvisa (art. 10).
- Responsável: farmacêutico RT ou substituto cadastrado no SNGPC (art. 10 §1º). O sistema que gera o XML deve ter acesso restrito ao RT/substituto (art. 18); o RT pode delegar a terceiros acesso parcial para inserção de dados (art. 18 §1º); gerar e enviar o XML é função do RT (art. 18 §2º).
- Estoque físico deve ser "qualitativa e quantitativamente idêntico" ao escriturado no SNGPC e no sistema (art. 15). Todo estoque movimentado deve ser escriturado, comercializável ou não (art. 16).
- Troca de RT exige finalizar o inventário antes (art. 12); o novo RT confere e corrige divergências (art. 12 §§1º–2º).
- Transferência de estoque só em encerramento, alteração de atividade ou junção (art. 13).
- O sistema deve garantir cópia de segurança dos dados de escrituração guardada por 2 anos (art. 19, I) e relatórios atualizados de estoques e movimentações (art. 19, II).
- Sigilo: é vedado disponibilizar a terceiros dados que identifiquem padrões de prescrição/dispensação/consumo (art. 21, parágrafo único).
- Escopo: medicamentos da Portaria 344/98 e antimicrobianos da RDC 471/2021 (FAQ CRF-GO, Informações gerais q.1–2 e q.9).

**Receituários (Portaria SVS/MS 344/98), conforme fontes secundárias (vigilâncias municipais/estaduais):**
- Notificação de Receita A (amarela): listas A1, A2 (entorpecentes) e A3 (psicotrópicos); validade 30 dias; até 5 ampolas ou 30 dias de tratamento (VISA Jundiaí; Portaria 344 art. 41).
- Notificação de Receita B (azul): listas B1 e B2; validade 30 dias; até 5 ampolas ou 60 dias de tratamento (art. 45–46, via Afya/VISA).
- Notificação de Receita Especial (branca): C2 (retinoides) e C3 (imunossupressores/talidomida).
- Receita de Controle Especial em 2 vias (branca): C1, C4, C5.
- Quantidade acima do limite exige justificativa do prescritor (art. 46 §1º, via fontes secundárias).
- Validade nacional dos receituários desde 07/02/2019 (Lei 13.732/2018).
- As listas da Portaria 344 são atualizadas por RDC da Anvisa com frequência.

**Antimicrobianos (RDC 471/2021, alterada pela RDC 973/2025 e IN 360/2025):**
- Receita válida por 10 dias da emissão (RDC 471 art. 7º; IN 360/2025 §2º).
- Receita em 2 vias com retenção da 2ª via (CRF-BA, nota 2025 — fonte secundária).
- IN 360/2025 inclui agonistas de GLP-1 com receita válida por 90 dias.

**SNCR (RDC 873/2024):** sistema nacional de numeração e baixa de receitas. Farmácias ainda não têm acesso; "o cronograma será divulgado" (Anvisa, notícia de 21/05/2026). Receitas físicas continuam válidas. SNGPC e SNCR coexistem.

**Retomada do SNGPC:** prazos de transmissão restabelecidos por região — Sudeste 01/09/2025; Sul e Norte 01/11/2025; Centro-Oeste e Nordeste 02/01/2026 (CFF, 06/05/2025; ICTQ). A JG atende o Amazonas (SEFAZ-AM, docs/farmacia/00-BLOQUEIOS.md B-02), região Norte → obrigatório desde 01/11/2025.

## Contrato de saída

Obrigações do estabelecimento: arquivos XML transmitidos no intervalo de 1–7 dias (art. 10 §3º); balanços de receitas "A" e "B2" continuam devidos à Vigilância local (FAQ CRF-GO q.6); relatórios de estoque e movimentação (art. 19, II).

## Limites e cotas

- 1–7 dias entre transmissões (RDC 22/2014 art. 10 §3º).
- Guarda: 2 anos (art. 19, I).
- Validades: 30 dias (A e B), 10 dias (antimicrobiano), 90 dias (GLP-1) — fontes acima.
- Quantidade máxima por receita: 5 ampolas / 30 dias (A), 5 ampolas / 60 dias (B) — fontes secundárias.

## Erros conhecidos e tratamento

- Inconsistência que impeça o envio: escriturar no sistema do estabelecimento e voltar ao SNGPC quando corrigida (art. 14 §§1º–2º).
- Penalidade por escrituração atrasada: Lei 6.437/1977 (FAQ CRF-GO q.15).

## Riscos para a nossa implementação

- As listas da Portaria 344 mudam por RDC: classificar o produto por lista (A1..C5) precisa ser cadastro editável, não tabela fixa no código.
- As regras de quantidade/validade vieram de fontes secundárias: bloquear venda por elas pode travar dispensação legítima (ex.: justificativa do prescritor). Validar ou só alertar é decisão de negócio.
- Exige papel "farmacêutico RT" (acesso restrito à geração do XML, art. 18) — hoje `UserRole` não tem esse papel.
- Exige CPF do RT, que hoje não existe em `User`.
- Dados de comprador/paciente são sensíveis (art. 21): relatórios e exportações precisam de controle de acesso.

## Fonte

- RDC 22/2014 (texto): https://www.macae.rj.gov.br/midia/uploads/RDC%2022-2014.pdf — acessado em 2026-10-16
- FAQ SNGPC 2025, CRF-GO: https://crfgo.org.br/img/FAQ_PERGUNTAS_E_RESPOSTAS_SNGPC_2025.pdf — acessado em 2026-10-16
- SNCR — Anvisa: https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2026/SNCR-o-que-muda-para-farmacias-e-drogarias-com-o-novo-sistema-de-controle-de-receitas — acessado em 2026-10-16
- CFF, prazos do SNGPC: https://site.cff.org.br/noticia/Noticias-gerais/06/05/2025/anvisa-reestabelece-prazos-para-transmissao-obrigatoria-de-arquivos-eletronicos-ao-sngpc — acessado em 2026-10-16
- ICTQ, datas de retomada: https://ictq.com.br/varejo-farmaceutico/4380-sngpc-anvisa-define-datas-para-retomada-obrigatoria-da-escrituracao-eletronica — acessado em 2026-10-16
- VISA Jundiaí, receitas de controle especial: https://visa.jundiai.sp.gov.br/wp-content/uploads/2024/09/Receitas-de-Controle-Especial-Orientacoes-para-preenchimento-e-conferencia-final.pdf — acessado em 2026-10-16
- Afya, Notificação B: https://portal.afya.com.br/carreira/notificacao-de-receita-b-o-que-e-e-como-funciona — acessado em 2026-10-16
- IN 360/2025: https://www.legisweb.com.br/legislacao/?id=477175 — acessado em 2026-10-16
- CRF-BA, nota 2025: https://www.crf-ba.org.br/wp-content/uploads/2025/10/CRF-BA-NOTA.pdf — acessado em 2026-10-16
