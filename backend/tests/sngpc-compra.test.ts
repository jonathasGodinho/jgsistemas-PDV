import { afterAll, describe, expect, it } from 'vitest';
import { prisma, criarProduto } from './factories';
import { cenarioSngpc } from './sngpc-factories';
import { como } from './http';

// T-05.01 — compra de produto SNGPC exige NF (D-13); a entrada no livro do lote guarda NF e CNPJ de origem.

afterAll(async () => {
  await prisma.$disconnect();
});

async function pedido(token: string, fornecedorId: string, produtoId: string, quantidade = 10) {
  const res = await como(token).post('/api/compras').send({ fornecedorId, itens: [{ produtoId, quantidade, custoUnitario: 5 }] });
  expect(res.status).toBe(201);
  const detalhe = await como(token).get(`/api/compras/${res.body.id}`);
  return { compraId: res.body.id as string, itemId: detalhe.body.itens[0].id as string };
}

describe('Compra de produto SNGPC exige NF (T-05.01)', () => {
  it('sem NF responde 400; com NF grava Purchase.nfNumero e ENTRADA_COMPRA com NF e CNPJ do fornecedor', async () => {
    const c = await cenarioSngpc();
    const { compraId, itemId } = await pedido(c.tokenAdmin, c.fornecedor.id, c.produto.id);
    const lotes = { [itemId]: { lote: 'L-NF', validade: '2028-01-31' } };

    const semNf = await como(c.tokenAdmin).post(`/api/compras/${compraId}/receber`).send({ lotes });
    expect(semNf.status).toBe(400);
    expect(semNf.body.erro).toMatch(/nota fiscal/i);

    const ok = await como(c.tokenAdmin).post(`/api/compras/${compraId}/receber`).send({ lotes, nfNumero: '123', nfData: '2026-10-10' });
    expect(ok.status).toBe(200);
    const compra = await prisma.purchase.findUnique({ where: { id: compraId } });
    expect(compra?.nfNumero).toBe('123');
    const entrada = await prisma.loteMovimento.findFirst({ where: { companyId: c.company.id, tipo: 'ENTRADA_COMPRA' } });
    expect(entrada?.nfNumero).toBe('123');
    expect(entrada?.cnpjOrigem).toBe(c.fornecedor.document);
    expect(entrada?.nfData?.toISOString().slice(0, 10)).toBe('2026-10-10');
  });

  it('item SNGPC sem lote informado é recusado mesmo com NF', async () => {
    const c = await cenarioSngpc();
    const { compraId } = await pedido(c.tokenAdmin, c.fornecedor.id, c.produto.id);
    const res = await como(c.tokenAdmin).post(`/api/compras/${compraId}/receber`).send({ nfNumero: '9', nfData: '2026-10-10' });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/lote/i);
  });

  it('compra só de produto comum recebe sem NF', async () => {
    const c = await cenarioSngpc();
    const comum = await criarProduto(c.company.id, { name: 'Sabonete', salePrice: 5, costPrice: 2 });
    const { compraId } = await pedido(c.tokenAdmin, c.fornecedor.id, comum.id);
    const res = await como(c.tokenAdmin).post(`/api/compras/${compraId}/receber`).send({});
    expect(res.status).toBe(200);
  });
});
