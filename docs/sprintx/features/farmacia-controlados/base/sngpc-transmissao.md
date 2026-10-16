# SNGPC — transmissão (upload no portal, webservice SOAP e API REST)

## Contrato de entrada

Três caminhos de envio existem na fonte:

1. **Upload manual no portal** pelo RT: "Caso os estabelecimentos não queiram transmitir o XML pela página de Upload disponibilizada pelo site da Anvisa..." (Manual do Desenvolvedor p. 4). Só o RT tem perfil de transmissão (FAQ CRF-GO, "Informações gerais" q.13); a senha é exclusiva do RT (q.11).
2. **Webservice SOAP** `sngpc.asmx` (Manual do Desenvolvedor p. 4–10):
   - Homologação: `http://homologacao.anvisa.gov.br/sngpc/webservice/sngpc.asmx`; Produção: `http://sngpc.anvisa.gov.br/webservice/sngpc.asmx` (p. 4–5).
   - `ValidarUsuario(Email, Senha)`.
   - `EnviaArquivoSNGPC(Email, Senha, Arq, Hashindenficacacao)`: `Arq` = XML compactado em zip e convertido em base64; hash = string de 32 caracteres (MD5) (p. 4 e 7).
   - `ConsultaDadosArquivoSNGPC(Email, Senha, CNPJ, Hash)` (p. 10).
   - "o SNGPC irá calcular o MD5 sobre o valor da base64 do arquivo compactado ... um valor diferente calculado pelo usuário, não impedirá a recepção do arquivo, mas é importante ser armazenado para futura consulta" (p. 4).
3. **API REST nova** (Swagger `https://sngpc-api.anvisa.gov.br/swagger/v1/swagger.json`, OpenAPI 3.0.4, "API SNGPC v1"):
   - `POST /v1/Authentication/GetToken` — corpo `User { username, password }`.
   - `POST /v1/FileXml/EnviarArquivoXmlSNGPC` — corpo `string` formato `byte`; segurança `Bearer` JWT.
   - `GET /v1/FileXml/ConsultaDadosArquivoXml/{email}/{cnpj}/{hash}`.
   - A página de Desenvolvedores diz que "o atual Webservice continuará ativo momentaneamente" e recomenda adaptar à nova API "o quanto antes".

## Contrato de saída

- SOAP `EnviaArquivoSNGPC`: string "Arquivo recebido com sucesso, em DD/MM/YYY, ás HH:MM:SS. O Hash calculado foi 'hash32caracteres'" ou mensagem de erro (Manual p. 8).
- SOAP `ConsultaDadosArquivoSNGPC`: string (conteúdo NÃO DOCUMENTADO no manual).
- API REST: as três operações declaram apenas `200` sem schema de resposta no Swagger — NÃO DOCUMENTADO.

## Limites e cotas

- Intervalo de transmissão: mínimo 1 e máximo 7 dias consecutivos, mesmo sem movimentação (RDC 22/2014, art. 10 §3º); no mínimo uma vez por semana (art. 10 §4º).
- Rate limit, tamanho máximo e validade do token JWT: NÃO DOCUMENTADO.

## Erros conhecidos e tratamento

- Desde 2025 o `ValidarUsuario` do SOAP retorna HTTP 403 após a inclusão de CAPTCHA no portal (relato no fórum Projeto ACBr, 2025: https://www.projetoacbr.com.br/forum/topic/9976-sngpc/). Não há resposta oficial sobre contorno.
- Download automatizado de `sngpc.anvisa.gov.br/schema/*.xsd` devolveu página "Bloqueado" (Cloudflare) em 2026-10-16 (teste local com curl).
- Durante a suspensão (RDC 586/2021) e em caso de inconsistência que impeça o envio, a escrituração deve continuar no sistema informatizado do estabelecimento (RDC 22/2014 art. 14 §1º; FAQ CRF-GO q.3).

## Riscos para a nossa implementação

- Envio automático exige guardar e-mail/usuário e senha do RT no sistema — credencial pessoal e exclusiva do RT (FAQ q.11). É segredo novo; a Fase 1 decidiu "nenhum novo segredo" (docs/farmacia/00-DECISOES.md D-14).
- O SOAP está bloqueado por CAPTCHA e a API REST não tem documentação de resposta: integração automática tem risco alto de não funcionar e não há ambiente de homologação documentado para a API REST.
- Caminho seguro e sempre aceito: o sistema gera o `.zip` com o XML e o RT faz upload no portal; o sistema guarda o hash MD5 para conferência.
- A conta é da filial (CNPJ emissor) e do RT (CPF transmissor): o sistema precisa de CPF do RT por filial.

## Fonte

- Manual do Desenvolvedor — Conexão ao Webservice do SNGPC: https://www.gov.br/anvisa/pt-br/assuntos/fiscalizacao-e-monitoramento/sngpc/desenvolvedores/arquivos/9139json-file-1/@@display-file/file — acessado em 2026-10-16
- Swagger API SNGPC: https://sngpc-api.anvisa.gov.br/swagger/v1/swagger.json — acessado em 2026-10-16
- Página Desenvolvedores SNGPC: https://www.gov.br/anvisa/pt-br/assuntos/fiscalizacao-e-monitoramento/sngpc/desenvolvedores — acessado em 2026-10-16
- FAQ SNGPC 2025, CRF-GO: https://crfgo.org.br/img/FAQ_PERGUNTAS_E_RESPOSTAS_SNGPC_2025.pdf — acessado em 2026-10-16
- RDC 22/2014: https://www.macae.rj.gov.br/midia/uploads/RDC%2022-2014.pdf — acessado em 2026-10-16
