import { afterAll, describe, expect, it } from 'vitest';
import { prisma, criarBranch, criarCompany, criarProduto, criarUser } from './factories';
import { como } from './http';

afterAll(async () => {
  await prisma.$disconnect();
});

async function cenario(semLote = false) {
  const company = await criarCompany();
  const branch = await criarBranch(company.id);
  const operador = await criarUser(company.id, {
    branchId: branch.id,
    role: 'ADMIN',
    sessionToken: `sessao-${crypto.randomUUID()}`,
    sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const produto = await criarProduto(company.id, { barcode: `MED-${Math.random().toString(36).slice(2, 8)}`, name: 'Dipirona 500mg', salePrice: 10, costPrice: 5 });

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

  const lotes = semLote
    ? []
    : [
        await criarLote(company.id, branch.id, produto.id, 'L-ANTIGO', '2026-12-31', 3),
        await criarLote(company.id, branch.id, produto.id, 'L-NOVO', '2027-12-31', 10),
      ];

  return { company, branch, operador, produto, lotes };
}

function criarLote(companyId: string, branchId: string, productId: string, lote: string, validade: string, quantidade: number) {
  return prisma.lote.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      branchId,
      productId,
      lote,
      validade: new Date(`${validade}T00:00:00`),
      quantidade,
      updatedAt: new Date(),
    },
  });
}

function vender(token: string, codigo: string, quantidade: number) {
  return como(token).post('/api/vendas').send({
    itens: [{ codigo, quantidade }],
    pagamento: { metodo: 'MONEY', valorRecebido: 1000 },
    naoEmitirNfe: true,
  });
}

describe('FEFO na venda do PDV (T-05.02)', () => {
  it('venda de medicamento baixa do lote de menor validade e registra movimento por lote', async () => {
    const { company, produto, operador } = await cenario();

    const res = await como(operador.sessionToken!).post('/api/vendas').send({
      itens: [{ codigo: produto.barcode, quantidade: 3 }],
      pagamento: { metodo: 'MONEY', valorRecebido: 40 },
      naoEmitirNfe: true,
    });

    expect(res.status).toBe(201);

    const lotes = await prisma.lote.findMany({ where: { companyId: company.id, productId: produto.id }, orderBy: { validade: 'asc' } });
    expect(lotes.map(l => [l.lote, Number(l.quantidade)])).toEqual([['L-ANTIGO', 0], ['L-NOVO', 10]]);

    const estoque = await prisma.inventory.findFirst({ where: { productId: produto.id } });
    expect(estoque?.quantity).toBe(17);

    const movLote = await prisma.inventoryMovement.findMany({ where: { inventoryId: estoque!.id, reason: { contains: 'Lote' } } });
    expect(movLote).toHaveLength(1);
    expect(movLote[0].quantity).toBe(-3);
    expect(movLote[0].reason).toContain('L-ANTIGO');
  });

  it('venda de produto sem lote conclui normalmente (T-05.04)', async () => {
    const { company, branch, produto } = await cenario(true);
    const operador = await prisma.user.findFirst({ where: { companyId: company.id } });
    expect(operador).not.toBeNull();

    const res = await como(operador!.sessionToken!).post('/api/vendas').send({
      itens: [{ codigo: produto.barcode, quantidade: 2 }],
      pagamento: { metodo: 'MONEY', valorRecebido: 20 },
      naoEmitirNfe: true,
    });

    expect(res.status).toBe(201);
    const estoque = await prisma.inventory.findFirst({ where: { productId: produto.id, branchId: branch.id } });
    expect(estoque?.quantity).toBe(18);
    expect(await prisma.lote.count({ where: { productId: produto.id } })).toBe(0);
  });
});
