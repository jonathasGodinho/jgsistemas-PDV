import { afterAll, describe, expect, it } from 'vitest';
import { prisma, criarBranch, criarCompany, criarProduto } from './factories';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('modelo de dados de farmácia (T-02.01)', () => {
  it('persiste e lê os campos de farmácia do Product', async () => {
    const company = await criarCompany();

    const criado = await prisma.product.create({
      data: {
        id: crypto.randomUUID(),
        companyId: company.id,
        name: 'Dipirona 500mg',
        unit: 'UN',
        updatedAt: new Date(),
        principioAtivo: 'Dipirona sódica',
        tipoMedicamento: 'GENERICO',
        registroMS: '1234567890123',
        pmc: 12.5,
      } as never,
    });

    const lido = await prisma.product.findUnique({ where: { id: criado.id } });

    expect(lido?.principioAtivo).toBe('Dipirona sódica');
    expect(lido?.tipoMedicamento).toBe('GENERICO');
    expect(lido?.registroMS).toBe('1234567890123');
    expect(Number(lido?.pmc)).toBe(12.5);
  });

  it('cria Lote ligado a produto e filial, e CmedPreco', async () => {
    const company = await criarCompany();
    const branch = await criarBranch(company.id);
    const produto = await criarProduto(company.id);

    const lote = await prisma.lote.create({
      data: {
        id: crypto.randomUUID(),
        companyId: company.id,
        branchId: branch.id,
        productId: produto.id,
        lote: 'L1',
        validade: new Date('2027-01-01'),
        quantidade: 10,
        updatedAt: new Date(),
      } as never,
    });

    const cmed = await prisma.cmedPreco.create({
      data: {
        id: crypto.randomUUID(),
        companyId: company.id,
        registroMS: '1234567890123',
        descricao: 'Dipirona 500mg',
        pmc: 12.5,
        updatedAt: new Date(),
      } as never,
    });

    const lotesDoProduto = await prisma.lote.findMany({ where: { productId: produto.id } });

    expect(lote.id).toBeTruthy();
    expect(Number(cmed.pmc)).toBe(12.5);
    expect(lotesDoProduto).toHaveLength(1);
    expect(lotesDoProduto[0].lote).toBe('L1');
    expect(new Date(lotesDoProduto[0].validade).toISOString().slice(0, 10)).toBe('2027-01-01');
  });
});
