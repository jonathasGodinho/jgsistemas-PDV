import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './factories';
import { cenarioSngpc, receitaValida } from './sngpc-factories';
import { como } from './http';

// T-06.07 — livro de escrituração do SNGPC por produto e lote (RDC 22/2014 art. 19, II).

afterAll(async () => {
  await prisma.$disconnect();
});

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('Livro de escrituração (T-06.07)', () => {
  it('entrada de 10 e venda de 3 de um lote: duas linhas e saldo final 7', async () => {
    const c = await cenarioSngpc({ lotes: [], estoque: 0 });
    const e = await como(c.tokenAdmin).post('/api/estoque/entrada').send({
      produtoId: c.produto.id, quantidade: 10, lote: 'L-N', validade: '2029-06-30', nfNumero: '321', nfData: iso(new Date()), cnpjOrigem: c.fornecedor.document,
    });
    expect(e.status).toBe(200);
    const v = await como(c.tokenAdmin).post('/api/vendas').send({ naoEmitirNfe: true, pagamento: { metodo: 'MONEY', valorRecebido: 100 }, receitas: [receitaValida()], itens: [{ codigo: c.produto.barcode, quantidade: 3, receita: 0 }] });
    expect(v.status).toBe(201);

    const res = await como(c.tokenRt).get(`/api/farmacia/sngpc/livro?inicio=${iso(new Date())}&fim=${iso(new Date())}`);
    expect(res.status).toBe(200);
    expect(res.body.linhas.map((l: any) => [l.tipo, l.lote, l.quantidade])).toEqual([['ENTRADA_MANUAL', 'L-N', 10], ['VENDA', 'L-N', -3]]);
    expect(res.body.linhas[0].nfNumero).toBe('321');
    expect(res.body.saldos).toEqual([{ produto: c.produto.name, registroMS: c.produto.registroMS, lote: 'L-N', saldoFinal: 7 }]);
  });

  it('usuário sem marca de RT recebe 403', async () => {
    const c = await cenarioSngpc();
    const res = await como(c.tokenAdmin).get('/api/farmacia/sngpc/livro');
    expect(res.status).toBe(403);
  });
});
