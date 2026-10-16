import { afterAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma, criarBranch, criarCompany, criarProduto, criarUser } from './factories';
import { como } from './http';

// D-20 — livro-razão do lote: cancelamento/devolução recompõem o lote exato que a venda
// consumiu, e a soma dos lotes nunca passa do estoque agregado.

afterAll(async () => {
  await prisma.$disconnect();
});

const SENHA = 'senha-admin-123';
const dia = 24 * 60 * 60 * 1000;
const emDias = (n: number) => new Date(Date.now() + n * dia);

async function cenario(estoqueInicial = 20, lotes: [string, Date, number][] = [
  ['L-ANTIGO', emDias(60), 3],
  ['L-NOVO', emDias(400), 10],
], comLivro = true) {
  const company = await criarCompany();
  const branch = await criarBranch(company.id);
  const admin = await criarUser(company.id, {
    branchId: branch.id,
    role: 'ADMIN',
    password: await bcrypt.hash(SENHA, 4),
    sessionToken: `sessao-${crypto.randomUUID()}`,
    sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const produto = await criarProduto(company.id, {
    barcode: `MED-${Math.random().toString(36).slice(2, 10)}`,
    name: 'Dipirona 500mg',
    salePrice: 10,
    costPrice: 5,
  });
  await prisma.cashRegister.create({
    data: { id: crypto.randomUUID(), companyId: company.id, branchId: branch.id, userId: admin.id, status: 'OPEN' },
  });
  await prisma.inventory.create({
    data: {
      id: crypto.randomUUID(),
      productId: produto.id,
      branchId: branch.id,
      quantity: estoqueInicial,
      minQuantity: 0,
      maxQuantity: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  for (const [lote, validade, quantidade] of lotes) {
    const l = await prisma.lote.create({
      data: { id: crypto.randomUUID(), companyId: company.id, branchId: branch.id, productId: produto.id, lote, validade, quantidade, updatedAt: new Date() },
    });
    // saldo de abertura no livro-razão, como faz a migração para lotes já existentes
    if (comLivro) {
      await prisma.loteMovimento.create({
        data: { id: crypto.randomUUID(), companyId: company.id, loteId: l.id, tipo: 'SALDO_INICIAL', quantidade },
      });
    }
  }
  return { company, branch, admin, produto, token: admin.sessionToken! };
}

const saldos = async (produtoId: string) =>
  (await prisma.lote.findMany({ where: { productId: produtoId }, orderBy: { validade: 'asc' } })).map(l => [l.lote, Number(l.quantidade)]);
const estoqueDe = async (produtoId: string) => (await prisma.inventory.findFirst({ where: { productId: produtoId, variantId: null } }))!.quantity;

function vender(token: string, codigo: string, quantidade: number) {
  return como(token).post('/api/vendas').send({
    itens: [{ codigo, quantidade }],
    pagamento: { metodo: 'MONEY', valorRecebido: 1000 },
    naoEmitirNfe: true,
  });
}

describe('Cancelamento de venda recompõe o lote consumido (B-01 / D-20)', () => {
  it('venda grava o livro-razão com a venda e o item; cancelar devolve exatamente aos lotes de origem', async () => {
    const { produto, token } = await cenario();

    const venda = await vender(token, produto.barcode!, 5); // 3 do L-ANTIGO + 2 do L-NOVO
    expect(venda.status).toBe(201);
    expect(await saldos(produto.id)).toEqual([['L-ANTIGO', 0], ['L-NOVO', 8]]);

    const sale = await prisma.sale.findFirst({ where: { status: 'COMPLETED', SaleItem: { some: { productId: produto.id } } }, include: { SaleItem: true } });
    const baixas = await prisma.loteMovimento.findMany({ where: { saleId: sale!.id, tipo: 'VENDA' } });
    expect(baixas).toHaveLength(2);
    expect(baixas.every(b => b.saleItemId === sale!.SaleItem[0].id)).toBe(true);
    expect(baixas.map(b => Number(b.quantidade)).sort((a, b) => a - b)).toEqual([-3, -2]);

    // um único movimento agregado de estoque, com os lotes no motivo (sem movimento duplicado por lote)
    const movs = await prisma.inventoryMovement.findMany({ where: { Inventory: { productId: produto.id }, type: 'SALE' } });
    expect(movs).toHaveLength(1);
    expect(movs[0].quantity).toBe(-5);
    expect(movs[0].reason).toContain('L-ANTIGO');
    expect(movs[0].reason).toContain('L-NOVO');

    const cancel = await como(token).post(`/api/vendas/${sale!.id}/cancelar`).send({ senhaAdmin: SENHA, motivo: 'teste' });
    expect(cancel.status).toBe(200);
    expect(await saldos(produto.id)).toEqual([['L-ANTIGO', 3], ['L-NOVO', 10]]);
    expect(await estoqueDe(produto.id)).toBe(20);

    const estornos = await prisma.loteMovimento.findMany({ where: { saleId: sale!.id, tipo: 'CANCELAMENTO' } });
    expect(estornos.map(e => e.origemId).sort()).toEqual(baixas.map(b => b.id).sort());

    // o histórico de cada lote fecha com o saldo
    const conc = await como(token).get('/api/farmacia/lotes/conciliacao');
    expect(conc.body.coerente).toBe(true);
  });

  it('cancelar orçamento não mexe no estoque nem nos lotes', async () => {
    const { produto, token } = await cenario();
    const orc = await como(token).post('/api/vendas').send({
      itens: [{ codigo: produto.barcode, quantidade: 2 }],
      pagamento: { metodo: 'MONEY' },
      orcamento: true,
      naoEmitirNfe: true,
    });
    expect(orc.status).toBe(201);
    const sale = await prisma.sale.findFirst({ where: { status: 'PENDING', SaleItem: { some: { productId: produto.id } } } });
    const cancel = await como(token).post(`/api/vendas/${sale!.id}/cancelar`).send({ senhaAdmin: SENHA });
    expect(cancel.status).toBe(200);
    expect(await estoqueDe(produto.id)).toBe(20);
    expect(await saldos(produto.id)).toEqual([['L-ANTIGO', 3], ['L-NOVO', 10]]);
  });
});

describe('Troca/devolução (D-20)', () => {
  it('devolução parcial volta para o lote consumido por último; item novo sai por FEFO', async () => {
    const { produto, token } = await cenario();
    const venda = await vender(token, produto.barcode!, 5); // 3 L-ANTIGO + 2 L-NOVO
    expect(venda.status).toBe(201);
    const sale = await prisma.sale.findFirst({ where: { status: 'COMPLETED', SaleItem: { some: { productId: produto.id } } } });

    const troca = await como(token).post('/api/trocas').send({
      vendaId: sale!.id,
      senhaAdmin: SENHA,
      itensDevolvidos: [{ codigo: produto.barcode, quantidade: 2 }],
      itensNovos: [],
    });
    expect(troca.status).toBe(201);
    expect(await saldos(produto.id)).toEqual([['L-ANTIGO', 0], ['L-NOVO', 10]]);
    expect(await estoqueDe(produto.id)).toBe(17);

    const devolucoes = await prisma.loteMovimento.findMany({ where: { saleId: sale!.id, tipo: 'DEVOLUCAO' } });
    expect(devolucoes.map(d => Number(d.quantidade))).toEqual([2]);
  });

  it('item novo da troca baixa lote por FEFO', async () => {
    const { produto, token } = await cenario();
    const venda = await vender(token, produto.barcode!, 1);
    expect(venda.status).toBe(201);
    const sale = await prisma.sale.findFirst({ where: { status: 'COMPLETED', SaleItem: { some: { productId: produto.id } } } });
    // após a venda: L-ANTIGO 2, L-NOVO 10. Leva 4 novos e devolve 1.
    const troca = await como(token).post('/api/trocas').send({
      vendaId: sale!.id,
      senhaAdmin: SENHA,
      itensDevolvidos: [{ codigo: produto.barcode, quantidade: 1 }],
      itensNovos: [{ codigo: produto.barcode, quantidade: 4 }],
    });
    expect(troca.status).toBe(201);
    // novos (4) saem antes da devolução: L-ANTIGO 2 → 0, L-NOVO 10 → 8; devolução (1) volta ao L-ANTIGO
    expect(await saldos(produto.id)).toEqual([['L-ANTIGO', 1], ['L-NOVO', 8]]);
    expect(await estoqueDe(produto.id)).toBe(16);
  });
});

describe('Lote vencido não é vendável (D-17 / D-20)', () => {
  it('bloqueia a venda que só poderia sair de lote vencido', async () => {
    const { produto, token } = await cenario(5, [['L-VENCIDO', emDias(-10), 5]]);
    const res = await vender(token, produto.barcode!, 1);
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/vencido/);
    expect(await estoqueDe(produto.id)).toBe(5);
  });

  it('vende o saldo sem lote mesmo havendo lote vencido, sem tocar no vencido', async () => {
    const { produto, token } = await cenario(8, [['L-VENCIDO', emDias(-10), 5]]);
    const res = await vender(token, produto.barcode!, 3);
    expect(res.status).toBe(201);
    expect(await saldos(produto.id)).toEqual([['L-VENCIDO', 5]]);
    expect(await estoqueDe(produto.id)).toBe(5);
  });
});

describe('Movimentos manuais mantêm a soma dos lotes ≤ estoque (D-20)', () => {
  it('entrada manual com lote cria o lote e registra no livro-razão', async () => {
    const { produto, token } = await cenario(13);
    const res = await como(token).post('/api/estoque/entrada').send({ produtoId: produto.id, quantidade: 4, lote: 'L-MANUAL', validade: '2030-01-31' });
    expect(res.status).toBe(200);
    expect(await estoqueDe(produto.id)).toBe(17);
    const lote = await prisma.lote.findFirst({ where: { productId: produto.id, lote: 'L-MANUAL' }, include: { Movimentos: true } });
    expect(Number(lote!.quantidade)).toBe(4);
    expect(lote!.Movimentos.map(m => [m.tipo, Number(m.quantidade)])).toEqual([['ENTRADA_MANUAL', 4]]);
  });

  it('saída informando o lote baixa daquele lote', async () => {
    const { produto, token } = await cenario(13);
    const lote = await prisma.lote.findFirst({ where: { productId: produto.id, lote: 'L-NOVO' } });
    const res = await como(token).post('/api/estoque/saida').send({ produtoId: produto.id, quantidade: 4, loteId: lote!.id, motivo: 'Quebra / avaria' });
    expect(res.status).toBe(200);
    expect(await saldos(produto.id)).toEqual([['L-ANTIGO', 3], ['L-NOVO', 6]]);
    expect(await estoqueDe(produto.id)).toBe(9);
  });

  it('saída sem lote usa primeiro o saldo sem lote; ajuste abaixo da soma baixa vencidos primeiro', async () => {
    const { produto, token } = await cenario(20, [['L-VENCIDO', emDias(-5), 4], ['L-BOM', emDias(300), 10]]);
    // 20 em estoque, 14 em lotes → 6 sem lote; saída de 5 não toca lote
    const saida = await como(token).post('/api/estoque/saida').send({ produtoId: produto.id, quantidade: 5 });
    expect(saida.status).toBe(200);
    expect(await saldos(produto.id)).toEqual([['L-VENCIDO', 4], ['L-BOM', 10]]);

    // ajuste para 8 (abaixo dos 14 em lote): sai 6 — os 4 vencidos e 2 do L-BOM
    const ajuste = await como(token).post('/api/estoque/ajuste').send({ produtoId: produto.id, quantidade: 8 });
    expect(ajuste.status).toBe(200);
    expect(await saldos(produto.id)).toEqual([['L-VENCIDO', 0], ['L-BOM', 8]]);
    expect(await estoqueDe(produto.id)).toBe(8);
  });
});

describe('Conciliação de lotes (D-20)', () => {
  it('aponta e corrige lote acima do estoque e lote sem histórico', async () => {
    // estoque 5, mas lotes somam 13 e não têm linha no livro-razão (dados anteriores ao D-20)
    const { produto, token } = await cenario(5, undefined, false);
    const antes = await como(token).get('/api/farmacia/lotes/conciliacao');
    expect(antes.status).toBe(200);
    expect(antes.body.coerente).toBe(false);
    expect(antes.body.produtos.find((p: any) => p.produtoId === produto.id).situacao).toBe('LOTES_ACIMA_DO_ESTOQUE');
    expect(antes.body.lotesDivergentes.filter((l: any) => l.produtoId === produto.id)).toHaveLength(2);

    const corrigir = await como(token).post('/api/farmacia/lotes/conciliar').send({});
    expect(corrigir.status).toBe(200);
    expect(corrigir.body.coerente).toBe(true);
    // excedente de 8 sai do lote de menor validade primeiro
    expect(await saldos(produto.id)).toEqual([['L-ANTIGO', 0], ['L-NOVO', 5]]);
    expect(await estoqueDe(produto.id)).toBe(5);
  });
});
