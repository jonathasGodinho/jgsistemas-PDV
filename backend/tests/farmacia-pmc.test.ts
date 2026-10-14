import { afterAll, describe, expect, it } from 'vitest';
import { comEmpresa } from '../src/tenant';
import { importarCmed } from '../src/utils/cmed';
import { pmcDoProduto, resolverPmc } from '../src/utils/pmc';
import { criarCompany, prisma } from './factories';

afterAll(async () => {
  await prisma.$disconnect();
});

const CSV = 'registroMS,descricao,pmc\n1234567890123,Dipirona 500mg,12.50\n';

describe('Resolvedor de PMC por Registro MS (T-07.03)', () => {
  it('resolve o PMC da CMED pelo registro MS do produto (D-11)', async () => {
    const company = await criarCompany();
    await importarCmed(company.id, CSV);

    expect(await comEmpresa(company.id, () => resolverPmc('1234567890123'))).toBe(12.5);
  });

  it('produto sem correspondência na CMED não tem PMC (D-08)', async () => {
    const company = await criarCompany();
    await importarCmed(company.id, CSV);

    expect(await comEmpresa(company.id, () => resolverPmc('9999999999999'))).toBeNull();
    expect(await comEmpresa(company.id, () => resolverPmc(null))).toBeNull();
    expect(await comEmpresa(company.id, () => resolverPmc(undefined))).toBeNull();
  });

  it('não vaza PMC de outra empresa (multiempresa)', async () => {
    const comPreco = await criarCompany();
    const semPreco = await criarCompany();
    await importarCmed(comPreco.id, CSV);

    expect(await comEmpresa(semPreco.id, () => resolverPmc('1234567890123'))).toBeNull();
  });

  it('produto sem linha na CMED usa o PMC cadastrado no próprio produto', async () => {
    const company = await criarCompany();
    await importarCmed(company.id, CSV);

    expect(await comEmpresa(company.id, () => pmcDoProduto({ registroMS: '1234567890123' }))).toBe(12.5);
    expect(await comEmpresa(company.id, () => pmcDoProduto({ registroMS: '9999999999999', pmc: 20 }))).toBe(20);
    expect(await comEmpresa(company.id, () => pmcDoProduto({ registroMS: null, pmc: 7 }))).toBe(7);
    expect(await comEmpresa(company.id, () => pmcDoProduto({ registroMS: '9999999999999' }))).toBeNull();
    expect(await comEmpresa(company.id, () => pmcDoProduto({}))).toBeNull();
  });
});
