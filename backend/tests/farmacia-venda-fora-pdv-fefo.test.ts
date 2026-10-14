import { describe, expect, it } from 'vitest';
import { criarBranch, criarCompany, criarProduto, criarUser, prisma } from './factories';
import { como } from './http';

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

describe('FEFO na venda fora do PDV (T-05.03)', () => {
  it('venda a prazo baixa do lote de menor validade e registra movimento por lote', async () => {
    const company = await criarCompany();
    const branch = await criarBranch(company.id);
    const operador = await criarUser(company.id, {
      branchId: branch.id,
      sessionToken: crypto.randomUUID(),
      sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const produto = await criarProduto(company.id, {
      barcode: `MED-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Amoxicilina 500mg',
      salePrice: 20,
      costPrice: 8,
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

    await criarLote(company.id, branch.id, produto.id, 'L-ANTIGO', '2026-12-31', 3);
    await criarLote(company.id, branch.id, produto.id, 'L-NOVO', '2027-12-31', 10);

    const res = await como(operador.sessionToken!).post('/api/vendas-fora-pdv').send({
      cliente: 'Maria da Silva',
      itens: [{ codigo: produto.barcode, quantidade: 3 }],
      parcelas: 1,
      primeiraVencimento: '2026-12-01',
    });

    expect(res.status).toBe(201);

    const lotes = await prisma.lote.findMany({ where: { productId: produto.id }, orderBy: { validade: 'asc' } });
    expect(lotes.map((l) => [l.lote, Number(l.quantidade)])).toEqual([
      ['L-ANTIGO', 0],
      ['L-NOVO', 10],
    ]);

    const estoque = await prisma.inventory.findFirst({ where: { productId: produto.id, branchId: branch.id } });
    expect(estoque?.quantity).toBe(17);

    const movimentos = await prisma.inventoryMovement.findMany({ where: { inventoryId: estoque!.id } });
    const doLote = movimentos.filter((m) => m.reason?.includes('Lote L-ANTIGO'));
    expect(doLote).toHaveLength(1);
    expect(doLote[0].quantity).toBe(-3);
  });
});
