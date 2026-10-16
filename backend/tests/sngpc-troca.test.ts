import { afterAll, describe, expect, it } from 'vitest';
import { prisma, criarProduto } from './factories';
import { cenarioSngpc, SENHA_ADMIN } from './sngpc-factories';
import { como } from './http';

// T-03.06 — troca não aceita item novo SNGPC (D-11): venda de controlado/antimicrobiano é no PDV, com receita.

afterAll(async () => {
  await prisma.$disconnect();
});

async function cenarioTroca() {
  const c = await cenarioSngpc();
  const comum = await criarProduto(c.company.id, { barcode: `COMUM-${crypto.randomUUID().slice(0, 8)}`, name: 'Sabonete', salePrice: 5, costPrice: 2 });
  await prisma.inventory.create({
    data: { id: crypto.randomUUID(), productId: comum.id, branchId: c.branch.id, quantity: 10, minQuantity: 0, maxQuantity: 0, createdAt: new Date(), updatedAt: new Date() },
  });
  const venda = await como(c.tokenAdmin).post('/api/vendas').send({
    naoEmitirNfe: true, pagamento: { metodo: 'MONEY', valorRecebido: 100 }, itens: [{ codigo: comum.barcode, quantidade: 2 }],
  });
  const sale = await prisma.sale.findFirst({ where: { companyId: c.company.id, status: 'COMPLETED' } });
  return { c, comum, venda, sale: sale! };
}

describe('Troca com item novo SNGPC (T-03.06)', () => {
  it('item novo B1 responde 400 indicando venda com receita no PDV', async () => {
    const { c, comum, sale } = await cenarioTroca();
    const res = await como(c.tokenAdmin).post('/api/trocas').send({
      vendaId: sale.id, senhaAdmin: SENHA_ADMIN,
      itensDevolvidos: [{ codigo: comum.barcode, quantidade: 1 }],
      itensNovos: [{ codigo: c.produto.barcode, quantidade: 1 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/PDV com receita/);
    const inv = await prisma.inventory.findFirst({ where: { productId: c.produto.id } });
    expect(inv?.quantity).toBe(13);
  });

  it('item novo sem classe SNGPC responde 201', async () => {
    const { c, comum, sale } = await cenarioTroca();
    const res = await como(c.tokenAdmin).post('/api/trocas').send({
      vendaId: sale.id, senhaAdmin: SENHA_ADMIN,
      itensDevolvidos: [{ codigo: comum.barcode, quantidade: 1 }],
      itensNovos: [{ codigo: comum.barcode, quantidade: 1 }],
      pagamento: { metodo: 'MONEY', valorRecebido: 0 },
    });
    expect(res.status).toBe(201);
  });
});
