import { afterAll, describe, expect, it } from 'vitest';
import { importarCmed } from '../src/utils/cmed';
import { criarBranch, criarCompany, criarProduto, criarUser, prisma } from './factories';
import { como } from './http';

afterAll(async () => {
  await prisma.$disconnect();
});

const REGISTRO = '1234567890123';

async function cenario({ pmc, salePrice = 20 }: { pmc?: number; salePrice?: number } = {}) {
  const company = await criarCompany();
  const branch = await criarBranch(company.id);
  const operador = await criarUser(company.id, {
    branchId: branch.id,
    role: 'ADMIN',
    sessionToken: crypto.randomUUID(),
    sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const produto = await criarProduto(company.id, {
    barcode: `MED-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Dipirona 500mg',
    salePrice,
    costPrice: 5,
    registroMS: REGISTRO,
  });

  await prisma.cashRegister.create({
    data: { id: crypto.randomUUID(), companyId: company.id, branchId: branch.id, userId: operador.id, status: 'OPEN' },
  });
  await prisma.inventory.create({
    data: {
      id: crypto.randomUUID(),
      productId: produto.id,
      branchId: branch.id,
      quantity: 20,
      minQuantity: 0,
      maxQuantity: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  if (pmc !== undefined) {
    await importarCmed(company.id, `registroMS,descricao,pmc\n${REGISTRO},Dipirona 500mg,${pmc}\n`);
  }

  return { company, branch, operador, produto };
}

const vendaPdv = (token: string, codigo: string | null, quantidade: number) =>
  como(token).post('/api/vendas').send({
    itens: [{ codigo, quantidade }],
    pagamento: { metodo: 'MONEY', valorRecebido: 1000 },
    naoEmitirNfe: true,
  });

const vendaAprazo = (token: string, codigo: string | null, quantidade: number) =>
  como(token).post('/api/vendas-fora-pdv').send({
    cliente: 'Maria da Silva',
    itens: [{ codigo, quantidade }],
    parcelas: 1,
    primeiraVencimento: '2026-12-01',
  });

describe('Bloqueio de venda acima do PMC (T-07.04)', () => {
  it('o PDV recusa venda acima do PMC sem persistir venda nem baixar estoque', async () => {
    const { company, operador, produto } = await cenario({ pmc: 10, salePrice: 20 });

    const res = await vendaPdv(operador.sessionToken!, produto.barcode, 3);

    expect(res.status).toBe(400);
    expect(String(res.body.erro)).toContain('PMC');
    expect(await prisma.sale.count({ where: { companyId: company.id } })).toBe(0);

    const estoque = await prisma.inventory.findFirst({ where: { productId: produto.id } });
    expect(estoque?.quantity).toBe(20);
  });

  it('o PDV aceita venda no limite do PMC', async () => {
    const { operador, produto } = await cenario({ pmc: 10, salePrice: 10 });

    const res = await vendaPdv(operador.sessionToken!, produto.barcode, 2);

    expect(res.status).toBe(201);
  });

  it('a venda a prazo é recusada acima do PMC e liberada quando o produto não tem PMC (D-08)', async () => {
    const comPmc = await cenario({ pmc: 10, salePrice: 20 });
    const bloqueada = await vendaAprazo(comPmc.operador.sessionToken!, comPmc.produto.barcode, 1);
    expect(bloqueada.status).toBe(400);
    expect(String(bloqueada.body.erro)).toContain('PMC');

    const semPmc = await cenario({ salePrice: 20 });
    const liberada = await vendaAprazo(semPmc.operador.sessionToken!, semPmc.produto.barcode, 1);
    expect(liberada.status).toBe(201);
  });

  it('o bloqueio não depende do módulo de preços liberado (base/precos.md)', async () => {
    const anterior = process.env.JG_MODULOS;
    process.env.JG_MODULOS = 'vendas,estoque,cartoes,fidelidade,nfce';
    try {
      const { operador, produto } = await cenario({ pmc: 10, salePrice: 20 });

      const res = await vendaPdv(operador.sessionToken!, produto.barcode, 1);

      expect(res.status).toBe(400);
      expect(String(res.body.erro)).toContain('PMC');
    } finally {
      if (anterior === undefined) delete process.env.JG_MODULOS;
      else process.env.JG_MODULOS = anterior;
    }
  });
});
