import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma, criarCompany, criarBranch, criarUser, criarProduto } from './factories';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('factories e fixture CMED (T-01.03)', () => {
  it('cria Company, Branch, User e Product persistidos e relacionados', async () => {
    const company = await criarCompany();
    const branch = await criarBranch(company.id);
    const user = await criarUser(company.id);
    const produto = await criarProduto(company.id);

    expect(company.id).toBeTruthy();
    expect(branch.id).toBeTruthy();
    expect(user.id).toBeTruthy();
    expect(produto.id).toBeTruthy();

    const lido = await prisma.product.findUnique({
      where: { id: produto.id },
      include: { Company: true },
    });

    expect(lido?.Company?.id).toBe(company.id);
    expect(branch.companyId).toBe(company.id);
    expect(user.companyId).toBe(company.id);
  });

  it('a fixture cmed.csv tem o cabeçalho do formato D-18', () => {
    const csv = readFileSync(resolve(process.cwd(), 'tests/fixtures/cmed.csv'), 'utf8');
    const cabecalho = csv.split(/\r?\n/)[0];
    expect(cabecalho).toBe('registroMS,descricao,pmc');
  });
});
