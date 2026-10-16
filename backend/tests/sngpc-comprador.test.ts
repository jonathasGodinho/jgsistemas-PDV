import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './factories';
import { cenarioSngpc, receitaValida } from './sngpc-factories';
import { como } from './http';

// T-03.07 — pré-preenchimento do comprador pela última receita do mesmo documento (D-23, D-30).

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Pré-preenchimento do comprador (T-03.07)', () => {
  it('devolve só os dados do comprador da última receita com o documento', async () => {
    const c = await cenarioSngpc();
    const venda = await como(c.tokenAdmin).post('/api/vendas').send({
      naoEmitirNfe: true, pagamento: { metodo: 'MONEY', valorRecebido: 100 },
      receitas: [receitaValida({ comprador: { nome: 'Antenor Nascente', tipoDocumento: 2, documento: '99878A', orgaoExpedidor: 'SSP', uf: 'AM' } })],
      itens: [{ codigo: c.produto.barcode, quantidade: 1, receita: 0 }],
    });
    expect(venda.status).toBe(201);

    // o caixa (SELLER) também pode consultar (D-30)
    const res = await como(c.tokenCaixa).get('/api/farmacia/receitas/comprador/99878A');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ nome: 'Antenor Nascente', tipoDocumento: 2, documento: '99878A', orgaoExpedidor: 'SSP', uf: 'AM' });
  });

  it('documento sem receita anterior devolve 404', async () => {
    const c = await cenarioSngpc();
    const res = await como(c.tokenAdmin).get('/api/farmacia/receitas/comprador/000000');
    expect(res.status).toBe(404);
  });
});
