import { afterAll, describe, expect, it } from 'vitest';
import { prisma, criarBranch, criarCompany, criarProduto } from './factories';
import { comEmpresa } from '../src/tenant';
import { baixarLotesFefo, selecionarLotes } from '../src/utils/fefo';

afterAll(async () => {
  await prisma.$disconnect();
});

async function cenario() {
  const company = await criarCompany();
  const branch = await criarBranch(company.id);
  const produto = await criarProduto(company.id, { salePrice: 10, costPrice: 5 });
  return { company, branch, produto };
}

function criarLote(companyId: string, branchId: string, productId: string, lote: string, validade: string, quantidade: number) {
  return prisma.lote.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      branchId,
      productId,
      lote,
      validade: new Date(`${validade}T00:00:00`),
      quantidade,
      updatedAt: new Date(),
    },
  });
}

describe('serviço FEFO (T-05.01)', () => {
  it('seleciona os lotes em ordem de validade crescente e respeita a quantidade', async () => {
    const { company, branch, produto } = await cenario();
    const antigo = await criarLote(company.id, branch.id, produto.id, 'L-ANTIGO', '2026-12-31', 3);
    const novo = await criarLote(company.id, branch.id, produto.id, 'L-NOVO', '2027-12-31', 10);

    const selecionados = await comEmpresa(company.id, () => selecionarLotes(produto.id, branch.id, 5));

    expect(selecionados).toHaveLength(2);
    expect(selecionados[0]).toMatchObject({ loteId: antigo.id, lote: 'L-ANTIGO', quantidade: 3 });
    expect(selecionados[1]).toMatchObject({ loteId: novo.id, lote: 'L-NOVO', quantidade: 2 });
  });

  it('nunca consome lote vencido (D-17)', async () => {
    const { company, branch, produto } = await cenario();
    const vencido = await criarLote(company.id, branch.id, produto.id, 'L-VENCIDO', '2020-01-01', 50);
    const valido = await criarLote(company.id, branch.id, produto.id, 'L-VALIDO', '2027-12-31', 4);

    const selecionados = await comEmpresa(company.id, () => selecionarLotes(produto.id, branch.id, 5));

    expect(selecionados).toHaveLength(1);
    expect(selecionados[0]).toMatchObject({ loteId: valido.id, quantidade: 4 });

    await comEmpresa(company.id, async () => {
      const aindaIntacto = await prisma.lote.findUnique({ where: { id: vencido.id } });
      expect(Number(aindaIntacto?.quantidade)).toBe(50);
    });
  });

  it('quantidade maior que o saldo devolve todo o saldo disponível', async () => {
    const { company, branch, produto } = await cenario();
    await criarLote(company.id, branch.id, produto.id, 'L1', '2027-01-31', 2);
    await criarLote(company.id, branch.id, produto.id, 'L2', '2027-02-28', 3);

    const selecionados = await comEmpresa(company.id, () => selecionarLotes(produto.id, branch.id, 10));

    expect(selecionados.map(l => l.quantidade)).toEqual([2, 3]);
  });

  it('baixa o saldo dos lotes na ordem de validade (T-05.01)', async () => {
    const { company, branch, produto } = await cenario();
    const antigo = await criarLote(company.id, branch.id, produto.id, 'L-ANTIGO', '2026-12-31', 3);
    const novo = await criarLote(company.id, branch.id, produto.id, 'L-NOVO', '2027-12-31', 10);

    const consumidos = await comEmpresa(company.id, () => baixarLotesFefo(produto.id, branch.id, 5));

    expect(consumidos.map(l => l.quantidade)).toEqual([3, 2]);
    await comEmpresa(company.id, async () => {
      const a = await prisma.lote.findUnique({ where: { id: antigo.id } });
      const n = await prisma.lote.findUnique({ where: { id: novo.id } });
      expect(Number(a?.quantidade)).toBe(0);
      expect(Number(n?.quantidade)).toBe(8);
    });
  });
});

describe('fallback de produto sem lote (T-05.04)', () => {
  it('produto sem lote devolve vazio, sem erro', async () => {
    const { company, branch, produto } = await cenario();

    const selecionados = await comEmpresa(company.id, () => selecionarLotes(produto.id, branch.id, 3));
    expect(selecionados).toEqual([]);

    const consumidos = await comEmpresa(company.id, () => baixarLotesFefo(produto.id, branch.id, 3));
    expect(consumidos).toEqual([]);
  });
});
