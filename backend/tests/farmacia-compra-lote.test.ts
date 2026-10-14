import { afterAll, describe, expect, it } from 'vitest';
import { prisma, criarBranch, criarCompany, criarProduto, criarUser } from './factories';
import { como } from './http';

afterAll(async () => {
  await prisma.$disconnect();
});

async function cenario() {
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
  return { company, branch, produto, fornecedor, token };
}

async function pedidoComUmItem(token: string, fornecedorId: string, produtoId: string, quantidade: number) {
  const res = await como(token).post('/api/compras').send({
    fornecedorId,
    itens: [{ produtoId, quantidade, custoUnitario: 5 }],
  });
  expect(res.status).toBe(201);
  const detalhe = await como(token).get(`/api/compras/${res.body.id}`);
  expect(detalhe.status).toBe(200);
  return { compraId: res.body.id as string, itemId: detalhe.body.itens[0].id as string };
}

function diaLocal(d: Date) {
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

describe('recebimento de compra cria lote (T-04.01)', () => {
  it('recebimento com lote e validade grava o Lote com a quantidade recebida', async () => {
    const { company, produto, fornecedor, token } = await cenario();
    const { compraId, itemId } = await pedidoComUmItem(token, fornecedor.id, produto.id, 10);

    const res = await como(token).post(`/api/compras/${compraId}/receber`).send({
      recebidos: { [itemId]: 10 },
      lotes: { [itemId]: { lote: 'L1', validade: '2027-01-01' } },
    });

    expect(res.status).toBe(200);

    const lotes = await prisma.lote.findMany({ where: { companyId: company.id, productId: produto.id } });
    expect(lotes).toHaveLength(1);
    expect(lotes[0].lote).toBe('L1');
    expect(Number(lotes[0].quantidade)).toBe(10);
    expect(diaLocal(lotes[0].validade)).toEqual([2027, 1, 1]);
  });

  it('lote sem validade é recusado com 400 e nada é recebido', async () => {
    const { company, produto, fornecedor, token } = await cenario();
    const { compraId, itemId } = await pedidoComUmItem(token, fornecedor.id, produto.id, 10);

    const res = await como(token).post(`/api/compras/${compraId}/receber`).send({
      recebidos: { [itemId]: 10 },
      lotes: { [itemId]: { lote: 'L1' } },
    });

    expect(res.status).toBe(400);
    expect(await prisma.lote.count({ where: { companyId: company.id, productId: produto.id } })).toBe(0);
    const compra = await prisma.purchase.findUnique({ where: { id: compraId } });
    expect(compra?.status).not.toBe('RECEIVED');
  });

  it('recebimento parcial grava o lote com a quantidade conferida', async () => {
    const { company, produto, fornecedor, token } = await cenario();
    const { compraId, itemId } = await pedidoComUmItem(token, fornecedor.id, produto.id, 10);

    const res = await como(token).post(`/api/compras/${compraId}/receber`).send({
      recebidos: { [itemId]: 4 },
      lotes: { [itemId]: { lote: 'L1', validade: '2027-01-01' } },
    });

    expect(res.status).toBe(200);
    const lotes = await prisma.lote.findMany({ where: { companyId: company.id, productId: produto.id } });
    expect(lotes).toHaveLength(1);
    expect(Number(lotes[0].quantidade)).toBe(4);
  });
});
