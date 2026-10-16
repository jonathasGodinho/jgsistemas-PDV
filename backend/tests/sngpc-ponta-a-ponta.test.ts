import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './factories';
import { cenarioSngpc, receitaValida } from './sngpc-factories';
import { como } from './http';
import { abrirZipBase64, contar, textoEm, textosEm } from './sngpc-xml';

// T-07.03 — fluxo SNGPC ponta a ponta pelas rotas reais: compra com NF → venda com receita → perda
// → movimentação e inventário coerentes com o saldo dos lotes (D-03, D-12, D-15).

afterAll(async () => {
  await prisma.$disconnect();
});

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('Fluxo SNGPC ponta a ponta (T-07.03)', () => {
  it('compra 10, venda 3 com receita e perda 1 geram arquivos coerentes com o saldo do lote', async () => {
    const c = await cenarioSngpc({ lotes: [], estoque: 0 });
    const hoje = iso(new Date());

    const pedido = await como(c.tokenAdmin).post('/api/compras').send({ fornecedorId: c.fornecedor.id, itens: [{ produtoId: c.produto.id, quantidade: 10, custoUnitario: 5 }] });
    const det = await como(c.tokenAdmin).get(`/api/compras/${pedido.body.id}`);
    const rec = await como(c.tokenAdmin).post(`/api/compras/${pedido.body.id}/receber`).send({
      nfNumero: '4455', nfData: hoje, lotes: { [det.body.itens[0].id]: { lote: 'L-1', validade: '2029-12-31' } },
    });
    expect(rec.status).toBe(200);

    // o caixa vende na própria registradora (fluxo do PDV)
    await prisma.cashRegister.create({ data: { id: crypto.randomUUID(), companyId: c.company.id, branchId: c.branch.id, userId: c.caixa.id, status: 'OPEN' } });
    const venda = await como(c.tokenCaixa).post('/api/vendas').send({
      naoEmitirNfe: true, pagamento: { metodo: 'MONEY', valorRecebido: 100 },
      receitas: [receitaValida()], itens: [{ codigo: c.produto.barcode, quantidade: 3, receita: 0 }],
    });
    expect(venda.status).toBe(201);

    const perda = await como(c.tokenAdmin).post('/api/estoque/saida').send({ produtoId: c.produto.id, quantidade: 1, motivoPerda: 2 });
    expect(perda.status).toBe(200);

    const mov = await como(c.tokenRt).post('/api/farmacia/sngpc/movimentacao').send({ dataInicio: hoje, dataFim: hoje });
    expect(mov.status).toBe(201);
    const arqMov = await prisma.sngpcArquivo.findUnique({ where: { id: mov.body.id } });
    const xmlMov = abrirZipBase64(arqMov!.zipBase64).xml;
    expect(xmlMov).toBe(arqMov!.xml);
    expect(contar(xmlMov, 'entradaMedicamentos')).toBe(1);
    expect(contar(xmlMov, 'saidaMedicamentoVendaAoConsumidor')).toBe(1);
    expect(contar(xmlMov, 'saidaMedicamentoPerda')).toBe(1);
    expect(textoEm(xmlMov, 'medicamentoEntrada/quantidadeMedicamento')).toBe('10');
    expect(textoEm(xmlMov, 'medicamentoVenda/quantidadeMedicamento')).toBe('3');
    expect(textoEm(xmlMov, 'medicamentoPerda/quantidadeMedicamento')).toBe('1');
    expect(textoEm(xmlMov, 'notaFiscalEntradaMedicamento/numeroNotaFiscal')).toBe('4455');

    const inv = await como(c.tokenRt).post('/api/farmacia/sngpc/inventario').send({ data: hoje });
    expect(inv.status).toBe(201);
    const arqInv = await prisma.sngpcArquivo.findUnique({ where: { id: inv.body.id } });
    const lote = await prisma.lote.findFirst({ where: { productId: c.produto.id, lote: 'L-1' } });
    expect(Number(lote!.quantidade)).toBe(6);
    expect(textosEm(arqInv!.xml, 'medicamentoEntrada/quantidadeMedicamento')).toEqual(['6']);
    expect(textoEm(arqInv!.xml, 'medicamentoEntrada/numeroLoteMedicamento')).toBe('L-1');
  });
});
