import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './factories';
import { cenarioSngpc, receitaValida } from './sngpc-factories';
import { como } from './http';

// T-03.05 — orçamento de produto SNGPC só efetiva com receita (D-11, contrato C-02).

afterAll(async () => {
  await prisma.$disconnect();
});

async function orcamentoB1() {
  const c = await cenarioSngpc();
  const orc = await como(c.tokenAdmin).post('/api/vendas').send({
    orcamento: true, naoEmitirNfe: true, pagamento: { metodo: 'MONEY' },
    itens: [{ codigo: c.produto.barcode, quantidade: 1 }],
  });
  const venda = await prisma.sale.findFirst({ where: { companyId: c.company.id, status: 'PENDING' }, include: { SaleItem: true } });
  return { c, orc, venda: venda! };
}

describe('Efetivar orçamento SNGPC (T-03.05)', () => {
  it('orçamento sem receita é criado e a efetivação com receita grava a Receita', async () => {
    const { c, orc, venda } = await orcamentoB1();
    expect(orc.status).toBe(201);
    const res = await como(c.tokenAdmin).post(`/api/vendas/${venda.id}/efetivar`).send({
      pagamento: { metodo: 'MONEY', valorRecebido: 100 },
      receitas: [receitaValida()],
      itensReceita: { [venda.SaleItem[0].id]: 0 },
    });
    expect(res.status).toBe(200);
    const receita = await prisma.receita.findFirst({ where: { saleId: venda.id } });
    expect(receita?.tipoReceituario).toBe(2);
    const item = await prisma.saleItem.findUnique({ where: { id: venda.SaleItem[0].id } });
    expect(item?.receitaId).toBe(receita!.id);
  });

  it('efetivar sem receita responde 400 e mantém o orçamento pendente', async () => {
    const { c, venda } = await orcamentoB1();
    const res = await como(c.tokenAdmin).post(`/api/vendas/${venda.id}/efetivar`).send({ pagamento: { metodo: 'MONEY', valorRecebido: 100 } });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/Receita obrigatória/);
    const relida = await prisma.sale.findUnique({ where: { id: venda.id } });
    expect(relida?.status).toBe('PENDING');
  });
});
