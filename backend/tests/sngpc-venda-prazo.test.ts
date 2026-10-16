import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './factories';
import { cenarioSngpc, receitaValida } from './sngpc-factories';
import { como } from './http';

// T-03.04 — venda a prazo (crediário) com receita (D-11, contrato C-02).

afterAll(async () => {
  await prisma.$disconnect();
});

function venderAPrazo(token: string, corpo: Record<string, unknown>) {
  return como(token).post('/api/vendas-fora-pdv').send({ cliente: 'Maria da Silva', parcelas: 1, primeiraVencimento: '2026-12-01', ...corpo });
}

describe('Venda a prazo com receita (T-03.04)', () => {
  it('item B1 com receita válida: 201 e Receita ligada ao item', async () => {
    const c = await cenarioSngpc();
    const res = await venderAPrazo(c.tokenAdmin, {
      receitas: [receitaValida()],
      itens: [{ codigo: c.produto.barcode, quantidade: 1, receita: 0 }],
    });
    expect(res.status).toBe(201);
    const venda = await prisma.sale.findFirst({ where: { companyId: c.company.id }, include: { SaleItem: true } });
    const receita = await prisma.receita.findFirst({ where: { saleId: venda!.id } });
    expect(receita?.tipoReceituario).toBe(2);
    expect(venda!.SaleItem[0].receitaId).toBe(receita!.id);
  });

  it('sem receita responde 400 com Receita obrigatória', async () => {
    const c = await cenarioSngpc();
    const res = await venderAPrazo(c.tokenAdmin, { itens: [{ codigo: c.produto.barcode, quantidade: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/Receita obrigatória/);
    expect(await prisma.sale.count({ where: { companyId: c.company.id } })).toBe(0);
  });
});
