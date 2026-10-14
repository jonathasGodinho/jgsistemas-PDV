import { afterAll, describe, expect, it } from 'vitest';
import { prisma, criarCompany } from './factories';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('smoke do harness (T-01.04)', () => {
  it('persiste uma empresa usando a factory', async () => {
    const company = await criarCompany({ name: 'Smoke Ltda' });

    const lido = await prisma.company.findUnique({ where: { id: company.id } });

    expect(company.id).toBeTruthy();
    expect(lido?.name).toBe('Smoke Ltda');
  });
});
