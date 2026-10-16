import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './factories';
import { cenarioSngpc, receitaValida, emDias } from './sngpc-factories';
import { como } from './http';

// T-03.03 — produto SNGPC só vende com saldo em lote não vencido (D-09).

afterAll(async () => {
  await prisma.$disconnect();
});

function vender(token: string, codigo: string, quantidade: number, comReceita = true) {
  return como(token).post('/api/vendas').send({
    pagamento: { metodo: 'MONEY', valorRecebido: 1000 },
    naoEmitirNfe: true,
    ...(comReceita ? { receitas: [receitaValida()] } : {}),
    itens: [{ codigo, quantidade, ...(comReceita ? { receita: 0 } : {}) }],
  });
}

describe('Venda SNGPC exige saldo em lote (T-03.03)', () => {
  it('controlado com estoque 5 e lotes somando 2 recusa a venda de 3', async () => {
    const c = await cenarioSngpc({ lotes: [['L-A', emDias(90), 2]], estoque: 5 });
    const res = await vender(c.tokenAdmin, c.produto.barcode!, 3);
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/saldo em lote/i);
    const inv = await prisma.inventory.findFirst({ where: { productId: c.produto.id } });
    expect(inv?.quantity).toBe(5);

    // dentro do saldo em lote, vende
    const ok = await vender(c.tokenAdmin, c.produto.barcode!, 2);
    expect(ok.status).toBe(201);
  });

  it('produto sem classe SNGPC nas mesmas condições vende 3', async () => {
    const c = await cenarioSngpc({ lotes: [['L-A', emDias(90), 2]], estoque: 5 });
    await prisma.product.update({ where: { id: c.produto.id }, data: { classeSngpc: null, listaPortaria344: null } });
    const res = await vender(c.tokenAdmin, c.produto.barcode!, 3, false);
    expect(res.status).toBe(201);
  });
});
