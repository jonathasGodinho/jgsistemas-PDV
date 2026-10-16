import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './factories';
import { cenarioSngpc, receitaValida, SENHA_ADMIN } from './sngpc-factories';
import { como } from './http';

// T-05.04 — estorno de venda SNGPC já exportada abre inconsistência para o RT (D-05, RDC 22 art. 14).

afterAll(async () => {
  await prisma.$disconnect();
});

async function vendaB1(c: Awaited<ReturnType<typeof cenarioSngpc>>, quantidade = 2) {
  const res = await como(c.tokenAdmin).post('/api/vendas').send({
    naoEmitirNfe: true, pagamento: { metodo: 'MONEY', valorRecebido: 100 },
    receitas: [receitaValida()], itens: [{ codigo: c.produto.barcode, quantidade, receita: 0 }],
  });
  expect(res.status).toBe(201);
  return (await prisma.sale.findFirst({ where: { companyId: c.company.id }, orderBy: { createdAt: 'desc' } }))!;
}

async function exportarHoje(c: Awaited<ReturnType<typeof cenarioSngpc>>) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return prisma.sngpcArquivo.create({
    data: {
      id: crypto.randomUUID(), companyId: c.company.id, branchId: c.branch.id, tipo: 'MOVIMENTACAO',
      dataInicio: hoje, dataFim: hoje, hash: 'b'.repeat(32), xml: '<x/>', zipBase64: 'eA==', criadoPorId: c.rt.id,
    },
  });
}

describe('Inconsistência ao estornar venda exportada (T-05.04)', () => {
  it('cancelar venda B1 dentro de período exportado cria inconsistência ABERTA ligada à venda', async () => {
    const c = await cenarioSngpc();
    const venda = await vendaB1(c);
    const arquivo = await exportarHoje(c);
    const res = await como(c.tokenAdmin).post(`/api/vendas/${venda.id}/cancelar`).send({ senhaAdmin: SENHA_ADMIN, motivo: 'erro' });
    expect(res.status).toBe(200);
    const inc = await prisma.sngpcInconsistencia.findMany({ where: { companyId: c.company.id } });
    expect(inc).toHaveLength(1);
    expect(inc[0]).toMatchObject({ saleId: venda.id, arquivoId: arquivo.id, status: 'ABERTA' });
  });

  it('devolução de venda exportada cria inconsistência; cancelar venda não exportada não cria', async () => {
    const c = await cenarioSngpc();
    const naoExportada = await vendaB1(c, 1);
    const cancel = await como(c.tokenAdmin).post(`/api/vendas/${naoExportada.id}/cancelar`).send({ senhaAdmin: SENHA_ADMIN });
    expect(cancel.status).toBe(200);
    expect(await prisma.sngpcInconsistencia.count({ where: { companyId: c.company.id } })).toBe(0);

    const venda = await vendaB1(c, 2);
    await exportarHoje(c);
    const troca = await como(c.tokenAdmin).post('/api/trocas').send({
      vendaId: venda.id, senhaAdmin: SENHA_ADMIN, itensDevolvidos: [{ codigo: c.produto.barcode, quantidade: 1 }], itensNovos: [],
    });
    expect(troca.status).toBe(201);
    const inc = await prisma.sngpcInconsistencia.findMany({ where: { companyId: c.company.id } });
    expect(inc).toHaveLength(1);
    expect(inc[0].saleId).toBe(venda.id);
  });
});
