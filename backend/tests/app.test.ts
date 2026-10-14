import { afterAll, describe, expect, it } from 'vitest';
import crypto from 'crypto';
import { api, como } from './http';
import { prisma, criarBranch, criarCompany, criarUser } from './factories';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('app exportável e cliente HTTP (T-01.05)', () => {
  it('importa o app sem abrir porta e serve GET /robots.txt com 200', async () => {
    const res = await api().get('/robots.txt');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Disallow');
  });

  it('acessa rota protegida com a sessão criada pela factory', async () => {
    const company = await criarCompany();
    const branch = await criarBranch(company.id);
    const token = `sessao-${crypto.randomUUID()}`;
    await criarUser(company.id, {
      branchId: branch.id,
      sessionToken: token,
      sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await como(token).get('/api/produtos');

    expect(res.status).toBe(200);
  });
});
