# NFC-e SEFAZ-AM — Guia de Produção

Passo a passo para colocar em produção a emissão de cupom fiscal NFC-e (modelo 65)
do módulo `backend/src/nfe` deste projeto.

> **Ambientes (`tpAmb`)** — padrão SEFAZ, usado por todo o código:
> - `1` = **Produção** (`nfce.sefaz.am.gov.br`)
> - `2` = **Homologação** (`homnfce.sefaz.am.gov.br`)
>
> A tela Configurações > Cupom Fiscal já usa esta convenção (1 = Produção, 2 = Homologação).

---

## 1. Visão geral

- Emissão assíncrona (`indSinc=0`): envia o lote, recebe o recibo (`nRec`) e faz *polling*
  no `NfeRetAutorizacao4` (até 15 tentativas, 2,5 s) até a autorização.
- Impostos: Simples Nacional com `CSOSN` (padrão `102`), PIS/COFINS `CST 49` (isento).
- Assinatura XMLDSig (RSA-SHA1, enveloped signature, c14n) com certificado A1 (.pfx)
  ou A3 (token PKCS#11 via OpenSSL).
- QR Code versão 2 (NT 2015.002) com o CSC da SEFAZ-AM.
- Cancelamento: evento `110111` assinado (`RecepcaoEvento4`).

### Rotas da API

| Rota | Descrição |
|---|---|
| `POST /api/nfe/emitir/:saleId` | Emite a NFC-e de uma venda `COMPLETED` |
| `POST /api/nfe/cancelar/:saleId` | Cancela NFC-e autorizada (body: `{ "justificativa": "..." }` — mínimo 15 caracteres) |
| `GET /api/configuracoes` / `POST /api/configuracoes` | Lê/grava a configuração fiscal (campo `.nfe`) |

---

## 2. Pré-requisitos

1. **CNPJ ativo** com **Inscrição Estadual válida** e **credenciamento NFC-e** na SEFAZ-AM.
2. **Certificado digital e-CNPJ**: A1 (arquivo `.pfx`) ou A3 (token/mídia com middleware PKCS#11).
3. **CSC (Código de Segurança do Contribuinte) + ID do CSC**: solicitar no ambiente
   NFC-e da SEFAZ-AM (um para homologação e um para produção).
4. **Produtos cadastrados** com campos fiscais corretos: `NCM`, `CFOP`, unidade e
   código de barras (`GTIN/EAN`). Produto sem GTIN usa o valor `SEM GTIN`.

---

## 3. Dados fiscais da empresa (obrigatórios)

Cadastro em **Configurações > Empresa** (`Company` no banco):

| Campo | Exemplo | Observação |
|---|---|---|
| `document` (CNPJ) | `12.345.678/0001-90` | Formatado ou só números — o sistema remove a máscara |
| `stateReg` (IE) | `061000018` | **somente dígitos** |
| `cityCode` (IBGE) | `1302603` | Código IBGE do município (Manaus) |
| `city` | `Manaus` | |
| `state` | `AM` | |
| `zipCode` | `69000-000` | |
| `address` / `number` / `neighborhood` / `phone` | — | Endereço do emitente |
| `crt` | `1` | 1 = Simples Nacional |

> NFC-e **sem destinatário** é permitida (consumidor não identificado). Com cliente
> vinculado, cidade/UF do cliente precisam estar preenchidas (campo `cityCode` do cliente).

---

## 4. Certificado digital (`backend/.env`)

Remova de produção:
```env
# NUNCA use em produção:
# NFE_CERT_MODE=test
# NFE_DRY_RUN=1
```

### 4.1 Opção A1 (.pfx) — recomendado para começar

```env
NFE_CERT_PFX=C:\caminho\certificado.pfx
NFE_CERT_PASSWORD=senha_do_pfx
```

> O certificado é lido com `node-forge` (bags `pkcs8ShroudedKeyBag` /
> `encryptedPrivateKeyInfo` / `certBag`). Erro *"Nenhuma chave privada encontrada"*
> = senha errada ou pfx sem suporte.

### 4.2 Opção A3 (token PKCS#11)

```env
NFE_CERT_DLL=C:\caminho\aetpkcs11.dll    # DLL do middleware do token
NFE_CERT_PIN=123456
NFE_CERT_URI=pkcs11:type=private;pin-value=123456   # opcional (default derivado do PIN)
NFE_CERT_PEM=C:\caminho\certificado.pem  # certificado PÚBLICO exportado do token
NFE_OPENSSL=openssl                      # ou caminho completo do openssl
NFE_OPENSSL_CONFIG=                      # opcional
NFE_PROXY_URL=http://127.0.0.1:8443      # proxy TLS local (ver 4.3)
```

A assinatura do XML é feita externamente:
```bash
openssl dgst -sha1 -engine pkcs11 -keyform engine -sign "pkcs11:type=private;pin-value=123456" -out sig.bin -in signedinfo.txt
```

### 4.3 Por que o proxy TLS no A3

O Node.js **não** consegue apresentar o certificado do token PKCS#11 no handshake TLS
mutual da SEFAZ. Por isso, com A3 é preciso um proxy TLS local (nginx/stunnel) que usa o
token via `engine pkcs11` como certificado de cliente, e o app conecta através de
`NFE_PROXY_URL` (túnel `CONNECT`). Exemplo de bloco nginx:

```nginx
server {
    listen 127.0.0.1:8443;
    location / { proxy_pass https://homnfce.sefaz.am.gov.br; proxy_ssl_server_name on; }
    ssl_certificate /certs/sefaz/client.crt;   # via engine pkcs11
    ssl_certificate_key engine:pkcs11:...;     # engine pkcs11
    ssl_client_certificate ...;                # cadeia da SEFAZ
}
```

> Ajuste conforme o middleware do seu token; a assinatura do XML não depende do proxy.

---

## 5. Configuração fiscal (Configurações > Cupom Fiscal)

| Campo | Produção | Observação |
|---|---|---|
| Emitir cupom fiscal (NFC-e) | ✔ marcado | |
| Ambiente | **Produção** (tpAmb `1`) | |
| Série | a que estiver credenciada | ex.: `1` |
| Próximo Número | controle da numeração | o sistema incrementa a cada emissão; **não regredir** |
| CFOP Padrão | `5102` | |
| CSOSN Padrão | `102` | |
| CSC | token real da SEFAZ | obrigatório p/ QR Code |
| ID do CSC | id real da SEFAZ | |
| URL do QR Code | vazio (usa padrão) | produção: `https://sistemas.sefaz.am.gov.br/nfceweb/consultarNFCe.jsp` |

Equivalente via API:
```bash
curl -X POST http://localhost:3000/api/configuracoes \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"nfe":{"habilitado":true,"tpAmb":1,"serie":1,"cfopPadrao":"5102","csosnPadrao":"102","csc":"SEU_CSC","cscId":"1","qrcodeUrl":""}}'
```

---

## 6. Ordem de implantação

1. **Conferir dados fiscais** da empresa e dos produtos (NCM/CFOP/GTIN) — seção 3.
2. **Configurar A1** e testar em **homologação** (`tpAmb=2`): o sistema já aponta para
   `homnfce.sefaz.am.gov.br`. Emita uma venda de teste e confira o retorno.
3. **Validar o XML/QR/assinatura** (seção 7) e, se possível, conferir no simulador da SEFAZ.
4. **Obter CSC de produção**, trocar para `tpAmb=1`, remover `NFE_DRY_RUN` e
   `NFE_CERT_MODE=test`, e emitir uma **primeira NFC-e de produção de baixo valor**.
5. Conferir a nota no portal da SEFAZ-AM (consulta pelo QR Code / chave).
6. **A3**: antes de produção, validar assinatura via OpenSSL e o fluxo TLS via proxy.

---

## 7. Checklist de validação do XML

- `cUF` = `13` (AM), `mod` = `65`, `serie`/`nNF` corretos, `dhEmi` com fuso `-04:00`.
- `cMunFG` = código IBGE do município (ex.: `1302603`).
- Emitente: `CNPJ`, `IE` (dígitos), `CRT` = `1`, endereço completo.
- Itens: `NCM`, `CFOP` (`5102`), `cEAN`/`SEM GTIN`, quantidades e valores.
- Impostos: `ICMSSN` com `CSOSN` `102`; `PISOutr`/`COFINSOutr` com `CST 49`.
- `total/ICMSTot` coerente com `vNF`; `pag/detPag` com `tPag` válido.
- `infNFeSupl/qrCode`: `<url>?p=<chave>|2|<tpAmb>|<cscId>|<hash>` e `urlChave`.
- `Signature`: `Reference URI="#NFe{chave}"`, transform enveloped-signature + c14n,
  `DigestMethod` sha1, `SignatureMethod` rsa-sha1, `X509Certificate` do emitente.
- **Chave de 44 dígitos** com dígito verificador módulo 11 correto.
- Persistência: `Sale.nfeStatus = AUTORIZADA`, `nfeKey`, `nfeProtocol`, `nfeXmlEnviado`,
  `nfeXmlRetorno`, `nfeTpAmb`. Cancelamento → `CANCELADA` + registro em `NfeEvent`.

---

## 8. Segurança

- **Nunca commitar o `.env`** com senha/PIN; use variáveis de ambiente ou cofre de segredos.
- Proteja o arquivo `.pfx` e o PIN do token (acesso restrito ao servidor).
- Mantenha backup/controle dos números de NF-e emitidos e dos XMLs.

---

## 9. Soluções de problemas comuns

| Erro | Causa provável / solução |
|---|---|
| `NFE_CERT_PEM não configurado` | A3 sem o certificado público exportado; aponte `NFE_CERT_PEM` para o `.pem/.cer` do token |
| `Nenhuma chave privada encontrada no .pfx` | Senha errada ou pfx sem suporte (`node-forge`) |
| `Chave base inválida` | CNPJ/IE com máscara — o sistema limpa, mas confira `cityCode`/números |
| `Código do município (IBGE) da empresa é obrigatório` | `Company.cityCode` vazio — preencha o IBGE (seção 3) |
| `Produto sem NCM` | Preencha `Product.ncm` |
| `CSC/CSCId não configurados` | Informe o CSC real na tela Cupom Fiscal |
| Rejeição por CSC inválido | Confira CSC/ID e se o token é de produção quando `tpAmb=1` |
| Rejeição de esquema XML | Confira NCM, CFOP, unidade, GTIN e valores dos itens |
