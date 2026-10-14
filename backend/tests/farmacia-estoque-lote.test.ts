import { afterAll, describe, expect, it } from 'vitest';
import { prisma, criarBranch, criarCompany, criarProduto, criarUser } from './factories';
import { como } from './http';

afterAll(async () => {
  await prisma.$disconnect();
});

function diaLocal(d: Date) {
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

describe('posição de estoque por lote (T-04.02)', () => {
  it('lista um saldo por lote, com lote e validade', async () => {
    const company = await criarCompany();
    const branch = await criarBranch(company.id);
    const token = `sessao-${crypto.randomUUID()}`;
    await criarUser(company.id, {
      branchId: branch.id,
      role: 'ADMIN',
      sessionToken: token,
      sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const produto = await criarProduto(company.id, { salePrice: 10, costPrice: 5 });
    const fornecedor = await prisma.supplier.create({
      data: { id: crypto.randomUUID(), companyId: company.id, name: 'Distribuidora Teste', updatedAt: new Date() },
    });

    // Primeiro lote entra pelo recebimento da compra (T-04.01).
    const compra = await como(token).post('/api/compras').send({
      fornecedorId: fornecedor.id,
      itens: [{ produtoId: produto.id, quantidade: 10, custoUnitario: 5 }],
    });
    expect(compra.status).toBe(201);
    const detalhe = await como(token).get(`/api/compras/${compra.body.id}`);
    const itemId = detalhe.body.itens[0].id;
    const recebido = await como(token).post(`/api/compras/${compra.body.id}/receber`).send({
      recebidos: { [itemId]: 10 },
      lotes: { [itemId]: { lote: 'L1', validade: '2027-01-01' } },
    });
    expect(recebido.status).toBe(200);

    // Segundo lote do mesmo produto, com validade mais curta (deve vir primeiro no FEFO).
    await prisma.lote.create({
      data: {
        id: crypto.randomUUID(),
        companyId: company.id,
        branchId: branch.id,
        productId: produto.id,
        lote: 'L2',
        validade: new Date('2026-06-30T00:00:00'),
        quantidade: 5,
        updatedAt: new Date(),
      },
    });

    const res = await como(token).get(`/api/estoque?busca=${encodeURIComponent(produto.name)}`);
    expect(res.status).toBe(200);

    const linhasDeLote = res.body.filter((r: any) => r.lote);
    expect(linhasDeLote).toHaveLength(2);

    const l1 = linhasDeLote.find((r: any) => r.lote === 'L1');
    expect(Number(l1.quantidade)).toBe(10);
    expect(diaLocal(new Date(l1.validade))).toEqual([2027, 1, 1]);

    const l2 = linhasDeLote.find((r: any) => r.lote === 'L2');
    expect(Number(l2.quantidade)).toBe(5);
    expect(diaLocal(new Date(l2.validade))).toEqual([2026, 6, 30]);
  });

  it('mantém a linha do produto (saldo total) junto das linhas de lote', async () => {
    const company = await criarCompany();
    const branch = await criarBranch(company.id);
    const token = `sessao-${crypto.randomUUID()}`;
    await criarUser(company.id, {
      branchId: branch.id,
      role: 'ADMIN',
      sessionToken: token,
      sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const produto = await criarProduto(company.id, { salePrice: 10, costPrice: 5 });
    await prisma.lote.create({
      data: {
        id: crypto.randomUUID(),
        companyId: company.id,
        branchId: branch.id,
        productId: produto.id,
        lote: 'L9',
        validade: new Date('2026-12-31T00:00:00'),
        quantidade: 4,
        updatedAt: new Date(),
      },
    });

    const res = await como(token).get(`/api/estoque?busca=${encodeURIComponent(produto.name)}`);
    expect(res.status).toBe(200);

    const linhasDoProduto = res.body.filter((r: any) => r.id === produto.id && r.grade === null && !r.lote);
    expect(linhasDoProduto).toHaveLength(1);
    expect(linhasDoProduto[0].nome).toBe(produto.name);
  });
});
