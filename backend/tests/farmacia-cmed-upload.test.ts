import { afterAll, describe, expect, it } from 'vitest';
import { criarBranch, criarCompany, criarUser, prisma } from './factories';
import { como } from './http';

afterAll(async () => {
  await prisma.$disconnect();
});

const CSV = 'registroMS,descricao,pmc\n1112223334445,Amoxicilina 500mg,25.00\n1234567890123,Dipirona 500mg,12.50\n';

async function cenario() {
  const company = await criarCompany();
  const branch = await criarBranch(company.id);
  const admin = await criarUser(company.id, {
    branchId: branch.id,
    role: 'ADMIN',
    sessionToken: crypto.randomUUID(),
    sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const vendedor = await criarUser(company.id, {
    branchId: branch.id,
    role: 'SELLER',
    sessionToken: crypto.randomUUID(),
    sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return { company, admin, vendedor };
}

describe('Upload admin da planilha CMED (T-07.02)', () => {
  it('não-admin recebe 403 (D-14)', async () => {
    const { company, vendedor } = await cenario();

    const res = await como(vendedor.sessionToken!).post('/api/farmacia/cmed').send({ csv: CSV });

    expect(res.status).toBe(403);
    expect(await prisma.cmedPreco.count({ where: { companyId: company.id } })).toBe(0);
  });

  it('sem conteúdo CSV responde 400', async () => {
    const { admin } = await cenario();

    const res = await como(admin.sessionToken!).post('/api/farmacia/cmed').send({});

    expect(res.status).toBe(400);
  });

  it('admin importa a planilha e a reimportação substitui a tabela (D-05)', async () => {
    const { company, admin } = await cenario();

    const ok = await como(admin.sessionToken!).post('/api/farmacia/cmed').send({ csv: CSV });
    expect(ok.status).toBe(200);
    expect(ok.body.importados).toBe(2);

    const linhas = await prisma.cmedPreco.findMany({ where: { companyId: company.id }, orderBy: { registroMS: 'asc' } });
    expect(linhas.map((l) => [l.registroMS, Number(l.pmc)])).toEqual([
      ['1112223334445', 25],
      ['1234567890123', 12.5],
    ]);

    const reimportado = await como(admin.sessionToken!)
      .post('/api/farmacia/cmed')
      .send({ csv: 'registroMS,descricao,pmc\n9998887776665,Ibuprofeno,7.75\n' });
    expect(reimportado.status).toBe(200);
    expect(reimportado.body.importados).toBe(1);

    const finais = await prisma.cmedPreco.findMany({ where: { companyId: company.id } });
    expect(finais).toHaveLength(1);
    expect(finais[0].registroMS).toBe('9998887776665');
  });
});
