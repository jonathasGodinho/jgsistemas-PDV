# Lacunas

Uma linha por informação procurada e não encontrada, com onde foi procurada.

- [sngpc-padrao-xml] XSD oficial (`sngpc.anvisa.gov.br/schema/sngpcSimpleTypes.xsd` e demais) — download bloqueado por Cloudflare em 2026-10-16; enums de unidade/documento/órgão vieram do espelho sngpc-go, não do XSD oficial.
- [sngpc-padrao-xml] Formato da resposta de validação (`sngpcRetorno.xsd`) — não lido (mesmo bloqueio).
- [sngpc-padrao-xml] Como escriturar no XML o cancelamento ou a devolução de uma venda já transmitida — o Guia v2.3 só tem entrada, venda, transferência, perda e transformação (Guia p. 5).
- [sngpc-padrao-xml] Venda fracionada (quantidade menor que caixa/frasco) — Guia v2.3 não trata; unidade só aceita Caixas/Frascos.
- [sngpc-transmissao] Schemas de resposta da API REST nova (`sngpc-api.anvisa.gov.br`) — Swagger declara apenas `200` sem corpo; validade do token, rate limit e ambiente de homologação da API: não documentados.
- [sngpc-transmissao] Contorno oficial para o CAPTCHA que bloqueia o `ValidarUsuario` do webservice SOAP desde 2025 — procurado no fórum ACBr e na página de Desenvolvedores; sem resposta.
- [regulacao-controlados] Texto integral da Portaria 344/98 (validades e quantidades máximas por lista) — só fontes secundárias (vigilâncias municipais, Afya); a lista vigente de substâncias por lista (A1..C5) não foi ingerida.
- [regulacao-controlados] Texto integral da RDC 471/2021 consolidada com RDC 973/2025 (artigo exato de retenção da 2ª via) — só nota do CRF-BA.
- [modelo-dados-atual] Unidade comercial do produto em termos SNGPC (caixa vs frasco) — `Product.unit` é texto livre, default "UN".
