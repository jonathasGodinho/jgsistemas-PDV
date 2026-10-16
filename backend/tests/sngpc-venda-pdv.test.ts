import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './factories';
import { cenarioSngpc, receitaValida, diasAtras } from './sngpc-factories';
import { como } from './http';

// T-03.02 — venda do PDV com receita (D-04, D-10, D-11; contrato C-02).

afterAll(async () => {
  await prisma.$disconnect();
});

function vender(token: string, corpo: Record<string, unknown>) {
  return como(token).post('/api/vendas').send({ pagamento: { metodo: 'MONEY', valorRecebido: 1000 }, naoEmitirNfe: true, ...corpo });
}

describe('Venda PDV com receita (T-03.02)', () => {
  it('B1 com receita válida: 201, Receita tipo 2 ligada ao item e baixa VENDA no livro do lote', async () => {
    const c = await cenarioSngpc();
    const res = await vender(c.tokenAdmin, {
      receitas: [receitaValida()],
      itens: [{ codigo: c.produto.barcode, quantidade: 2, receita: 0 }],
    });
    expect(res.status).toBe(201);

    const venda = await prisma.sale.findFirst({ where: { companyId: c.company.id }, include: { SaleItem: true } });
    const receita = await prisma.receita.findFirst({ where: { saleId: venda!.id } });
    expect(receita).toMatchObject({ tipoReceituario: 2, numero: '12003', prescritorConselho: 'CRM', compradorDocumento: '99878A', uso: 1 });
    expect(venda!.SaleItem[0].receitaId).toBe(receita!.id);

    const baixas = await prisma.loteMovimento.findMany({ where: { saleId: venda!.id, tipo: 'VENDA' } });
    expect(baixas.reduce((s, b) => s + Number(b.quantidade), 0)).toBe(-2);
    expect(baixas.every(b => b.saleItemId === venda!.SaleItem[0].id)).toBe(true);
  });

  it('sem receita ou com receita vencida responde 400 e não baixa estoque', async () => {
    const c = await cenarioSngpc();
    const sem = await vender(c.tokenAdmin, { itens: [{ codigo: c.produto.barcode, quantidade: 1 }] });
    expect(sem.status).toBe(400);
    expect(sem.body.erro).toMatch(/Receita obrigatória/);

    const vencida = await vender(c.tokenAdmin, {
      receitas: [receitaValida({ dataPrescricao: diasAtras(31) })],
      itens: [{ codigo: c.produto.barcode, quantidade: 1, receita: 0 }],
    });
    expect(vencida.status).toBe(400);
    expect(vencida.body.erro).toMatch(/Receita vencida/);

    const inv = await prisma.inventory.findFirst({ where: { productId: c.produto.id } });
    expect(inv?.quantity).toBe(13);
    expect(await prisma.receita.count({ where: { companyId: c.company.id } })).toBe(0);
  });

  it('quantidade acima do máximo do produto exige confirmação (400 QTD_ACIMA_MAXIMO) e grava a confirmação', async () => {
    const c = await cenarioSngpc({ qtdMaxReceita: 1 });
    const semConfirmar = await vender(c.tokenAdmin, {
      receitas: [receitaValida()],
      itens: [{ codigo: c.produto.barcode, quantidade: 2, receita: 0 }],
    });
    expect(semConfirmar.status).toBe(400);
    expect(semConfirmar.body.codigo).toBe('QTD_ACIMA_MAXIMO');
    expect(semConfirmar.body.itens[0]).toMatchObject({ quantidade: 2, maximo: 1 });

    const confirmado = await vender(c.tokenAdmin, {
      receitas: [receitaValida({ quantidadeConfirmada: true })],
      itens: [{ codigo: c.produto.barcode, quantidade: 2, receita: 0 }],
    });
    expect(confirmado.status).toBe(201);
    const receita = await prisma.receita.findFirst({ where: { companyId: c.company.id } });
    expect(receita?.quantidadeConfirmada).toBe(true);
  });

  it('produto sem classe SNGPC continua vendendo sem receita', async () => {
    const c = await cenarioSngpc();
    await prisma.product.update({ where: { id: c.produto.id }, data: { classeSngpc: null, listaPortaria344: null } });
    const res = await vender(c.tokenAdmin, { itens: [{ codigo: c.produto.barcode, quantidade: 1 }] });
    expect(res.status).toBe(201);
  });
});
