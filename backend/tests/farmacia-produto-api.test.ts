import { afterAll, describe, expect, it } from 'vitest';
import { prisma, criarBranch, criarCompany, criarUser } from './factories';
import { como } from './http';

afterAll(async () => {
  await prisma.$disconnect();
});

async function cenario() {
  const company = await criarCompany();
  const branch = await criarBranch(company.id);
  const token = `sessao-${crypto.randomUUID()}`;
  await criarUser(companyId(company.id), {
    branchId: branch.id,
    role: 'ADMIN',
    sessionToken: token,
    sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return { company, branch, token };
}

function companyId(id: string) {
  return id;
}

describe('campos de farmácia na API de produtos (T-03.01)', () => {
  it('cria produto com os quatro campos e relê pela busca', async () => {
    const { token } = await cenario();
    const nome = `DIPIRONA ${Date.now()}`;

    const criar = await como(token).post('/api/produtos').send({
      nome,
      preco: 9.9,
      estoque: 5,
      principioAtivo: 'Dipirona sódica',
      tipoMedicamento: 'GENERICO',
      registroMS: '1234567890123',
      pmc: 12.5,
    });
    expect(criar.status).toBe(201);

    const busca = await como(token).get(`/api/produtos?busca=${encodeURIComponent(nome)}`);
    expect(busca.status).toBe(200);
    const item = busca.body.find((p: { nome: string }) => p.nome === nome.toUpperCase());
    expect(item).toBeTruthy();
    expect(item.principioAtivo).toBe('Dipirona sódica');
    expect(item.tipoMedicamento).toBe('GENERICO');
    expect(item.registroMS).toBe('1234567890123');
    expect(item.pmc).toBe(12.5);
  });

  it('rejeita tipo de medicamento fora da lista fixa com 400', async () => {
    const { token } = await cenario();

    const res = await como(token).post('/api/produtos').send({
      nome: `INVALIDO ${Date.now()}`,
      preco: 5,
      tipoMedicamento: 'HOMEOPATICO',
    });

    expect(res.status).toBe(400);
  });

  it('cria produto com MVA e redução de ST e relê pela busca (T-08.02)', async () => {
    const { token } = await cenario();
    const nome = `DIPIRONA ST ${Date.now()}`;

    const criar = await como(token).post('/api/produtos').send({
      nome,
      preco: 9.9,
      estoque: 5,
      tipoMedicamento: 'REFERENCIA',
      csosn: '500',
      mvaSt: 40,
      reducaoSt: 10,
    });
    expect(criar.status).toBe(201);

    const busca = await como(token).get(`/api/produtos?busca=${encodeURIComponent(nome)}`);
    const item = busca.body.find((p: { nome: string }) => p.nome === nome.toUpperCase());
    expect(item).toBeTruthy();
    expect(item.mvaSt).toBe(40);
    expect(item.reducaoSt).toBe(10);
  });

  it('rejeita MVA/redução fora do intervalo 0–100 com 400 (T-08.02)', async () => {
    const { token } = await cenario();

    const res = await como(token).post('/api/produtos').send({
      nome: `MVA INVALIDA ${Date.now()}`,
      preco: 5,
      mvaSt: 140,
    });

    expect(res.status).toBe(400);
  });
});
