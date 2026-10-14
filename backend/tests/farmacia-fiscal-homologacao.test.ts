import { afterAll, describe, expect, it } from 'vitest';
import { prisma, criarBranch, criarCompany, criarProduto, criarUser } from './factories';
import { como } from './http';
import { comEmpresa } from '../src/tenant';
import { salvarNfeConfig } from '../src/nfe/config';

afterAll(async () => {
  await prisma.$disconnect();
});

// D-06: a Fase 1 só está pronta quando a NFC-e monofásica é aceita em homologação.
// Este arquivo verifica (T-08.03): (1) o diagnóstico de homologação detecta a
// ausência de certificado e a emissão fala o motivo na própria venda, e (2) com um
// certificado de teste e a SEFAZ simulada (NFE_DRY_RUN=1) a NFC-e monofásica com
// ICMS-ST percorre o fluxo completo (lote -> recibo -> protocolo) e é gravada na venda.
const CNPJ = '11222333000181';

// Uma única empresa para os dois testes: `Company.document` é único no banco e
// evita depender de CNPJ fictício válido em duplicidade.
let cenarioCache: Awaited<ReturnType<typeof cenario>> | null = null;
async function dados() {
  if (!cenarioCache) cenarioCache = await cenario();
  return cenarioCache;
}

function itemFiscal(nome: string) {
  return {
    name: nome,
    barcode: '7891234567895',
    salePrice: 100,
    ncm: '30049099',
    cfop: '5102',
    csosn: '500',
    icmsAliq: 18,
    mvaSt: 40,
    reducaoSt: 0,
    tipoMedicamento: 'REFERENCIA',
    pisCst: '04',
    cofinsCst: '04',
  };
}

async function cenario() {
  const company = await criarCompany({
    document: CNPJ,
    name: 'Farmacia Homologacao Teste',
    tradeName: 'Farmacia Teste',
    stateReg: '131234567',
    crt: 1,
    address: 'Rua das Flores',
    number: '100',
    neighborhood: 'Centro',
    cityCode: '1302603',
    city: 'Manaus',
    state: 'AM',
    zipCode: '69005070',
  });
  const branch = await criarBranch(company.id);
  const token = `sessao-${crypto.randomUUID()}`;
  const user = await criarUser(company.id, {
    branchId: branch.id,
    role: 'ADMIN',
    sessionToken: token,
    sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return { company, branch, user, token };
}

async function vendaCompleta(companyId: string, branchId: string, userId: string, produtoId: string, total: number) {
  const venda = await prisma.sale.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      branchId,
      userId,
      status: 'COMPLETED',
      subtotal: total,
      total,
      updatedAt: new Date(),
    },
  });
  await prisma.saleItem.create({
    data: {
      id: crypto.randomUUID(),
      saleId: venda.id,
      productId: produtoId,
      quantity: 1,
      unitPrice: total,
      subtotal: total,
    },
  });
  await prisma.salePayment.create({
    data: {
      id: crypto.randomUUID(),
      saleId: venda.id,
      method: 'MONEY',
      amount: total,
    },
  });
  return venda;
}

describe('T-08.03 diagnostico de homologacao da NFC-e', () => {
  it('detecta a ausencia de certificado e registra a falha na venda', async () => {
    const { company, branch, token, user } = await dados();
    const produto = await criarProduto(company.id, { name: 'Produto sem fiscal', salePrice: 10 });
    const venda = await vendaCompleta(company.id, branch.id, user.id, produto.id, 10);
    await comEmpresa(company.id, () => salvarNfeConfig({ habilitado: true, tpAmb: 2, serie: '1' }));

    const status = await como(token).get('/api/nfe/status');
    expect(status.status).toBe(200);
    expect(status.body.ambiente).toBe('Homologação');
    expect(status.body.certificado).toBeNull();
    const itemCert = status.body.pendencias.find((p: { item: string }) => p.item === 'Certificado digital A1');
    expect(itemCert).toBeTruthy();
    expect(itemCert.ok).toBe(false);
    expect(status.body.pronto).toBe(false);

    const emissao = await como(token).post(`/api/nfe/emitir/${venda.id}`);
    expect(emissao.status).toBe(422);
    expect(emissao.body.ok).toBe(false);
    expect(emissao.body.status).toBe('SEM_CERTIFICADO');
    expect(String(emissao.body.mensagem)).toMatch(/certificado/i);

    const salva = await prisma.sale.findUnique({ where: { id: venda.id } });
    expect(salva?.nfeStatus).toBe('SEM_CERTIFICADO');
    expect(String(salva?.nfeError)).toMatch(/certificado/i);
  });

  it('autoriza NFC-e monofasica com ICMS-ST em homologacao (certificado de teste + SEFAZ simulada)', async () => {
    const anterior = { modo: process.env.NFE_CERT_MODE, dry: process.env.NFE_DRY_RUN };
    process.env.NFE_CERT_MODE = 'test';
    process.env.NFE_DRY_RUN = '1';
    try {
      const { company, branch, token, user } = await dados();
      const produto = await criarProduto(company.id, itemFiscal('DIPIRONA ST HOMOLOG'));
      const venda = await vendaCompleta(company.id, branch.id, user.id, produto.id, 100);
      await comEmpresa(company.id, () => salvarNfeConfig({ habilitado: true, tpAmb: 2, serie: '1', csc: 'CSC-TESTE-NAO-USAR', cscId: '000001' }));

      const emissao = await como(token).post(`/api/nfe/emitir/${venda.id}`);
      expect(emissao.status).toBe(200);
      expect(emissao.body.ok).toBe(true);
      expect(emissao.body.status).toBe('AUTORIZADA');
      expect(emissao.body.chave).toMatch(/^\d{44}$/);
      expect(emissao.body.protocolo).toBeTruthy();

      const salva = await prisma.sale.findUnique({ where: { id: venda.id } });
      expect(salva?.nfeStatus).toBe('AUTORIZADA');
      expect(salva?.nfeTpAmb).toBe(2);
      expect(String(salva?.nfceKey)).toMatch(/^\d{44}$/);
      expect(salva?.nfeEmitidoAt).toBeTruthy();

      const xml = String(salva?.nfeXmlEnviado ?? '');
      expect(xml).toContain('<tpAmb>2</tpAmb>');
      expect(xml).toContain('<PISNT>');
      expect(xml).toContain('<COFINSNT>');
      expect(xml).toContain('<ICMSST>');
      expect(xml).toContain('<vBCSTRet>140.00</vBCSTRet>');
      expect(xml).toContain('<vICMSSTRet>7.20</vICMSSTRet>');
    } finally {
      if (anterior.modo === undefined) delete process.env.NFE_CERT_MODE;
      else process.env.NFE_CERT_MODE = anterior.modo;
      if (anterior.dry === undefined) delete process.env.NFE_DRY_RUN;
      else process.env.NFE_DRY_RUN = anterior.dry;
    }
  });
});
