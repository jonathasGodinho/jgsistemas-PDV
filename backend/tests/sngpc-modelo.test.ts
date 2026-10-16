import { afterAll, describe, expect, it } from 'vitest';
import db from '../src/db';
import { comEmpresa } from '../src/tenant';
import { prisma, criarBranch, criarCompany, criarProduto, criarUser } from './factories';

// T-01.01 — schema da Fase 2 (contrato C-01 em docs/sprintx/features/farmacia-controlados/00-DECISOES.md)

afterAll(async () => {
  await prisma.$disconnect();
});

async function vendaCom(companyId: string) {
  const branch = await criarBranch(companyId);
  const user = await criarUser(companyId, { branchId: branch.id });
  const produto = await criarProduto(companyId, { classeSngpc: 'CONTROLADO', listaPortaria344: 'B1', registroMS: '1234567890123' });
  const sale = await prisma.sale.create({
    data: { id: crypto.randomUUID(), companyId, branchId: branch.id, userId: user.id, status: 'COMPLETED', updatedAt: new Date() },
  });
  return { branch, user, produto, sale };
}

function receitaDados(companyId: string, saleId: string) {
  return {
    id: crypto.randomUUID(),
    companyId,
    saleId,
    tipoReceituario: 2,
    numero: '12003',
    dataPrescricao: new Date(),
    uso: 1,
    prescritorNome: 'Jacinto Aquino',
    prescritorConselho: 'CRM',
    prescritorNumero: '12345',
    prescritorUf: 'AM',
    compradorNome: 'Antenor Nascente',
    compradorTipoDoc: 2,
    compradorDocumento: '99878A',
    compradorOrgao: 'SSP',
    compradorUf: 'AM',
  };
}

describe('Schema da Fase 2 — controlados e SNGPC (T-01.01)', () => {
  it('grava Receita e SaleItem com receitaId apontando para ela', async () => {
    const company = await criarCompany();
    const { produto, sale } = await vendaCom(company.id);

    const receita = await prisma.receita.create({ data: receitaDados(company.id, sale.id) });
    const item = await prisma.saleItem.create({
      data: { id: crypto.randomUUID(), saleId: sale.id, productId: produto.id, quantity: 1, unitPrice: 10, subtotal: 10, receitaId: receita.id },
    });

    const lido = await prisma.saleItem.findUnique({ where: { id: item.id }, include: { Receita: true } });
    expect(lido?.Receita?.prescritorConselho).toBe('CRM');
    expect(lido?.Receita?.tipoReceituario).toBe(2);
    expect(lido?.Receita?.quantidadeConfirmada).toBe(false);

    const p = await prisma.product.findUnique({ where: { id: produto.id } });
    expect(p?.classeSngpc).toBe('CONTROLADO');
    expect(p?.unidadeSngpc).toBe(1);
  });

  it('isola Receita, SngpcArquivo e SngpcInconsistencia por empresa', async () => {
    const a = await criarCompany();
    const b = await criarCompany();
    const deB = await vendaCom(b.id);
    await prisma.receita.create({ data: receitaDados(b.id, deB.sale.id) });
    await prisma.sngpcArquivo.create({
      data: {
        id: crypto.randomUUID(), companyId: b.id, branchId: deB.branch.id, tipo: 'MOVIMENTACAO',
        dataInicio: new Date(), dataFim: new Date(), hash: 'a'.repeat(32), xml: '<x/>', zipBase64: 'eA==', criadoPorId: deB.user.id,
      },
    });
    await prisma.sngpcInconsistencia.create({
      data: { id: crypto.randomUUID(), companyId: b.id, branchId: deB.branch.id, saleId: deB.sale.id, descricao: 'teste' },
    });

    const vistoPorA = await comEmpresa(a.id, async () => ({
      receitas: await db.receita.count({ where: { saleId: deB.sale.id } }),
      arquivos: await db.sngpcArquivo.count({ where: { branchId: deB.branch.id } }),
      inconsistencias: await db.sngpcInconsistencia.count({ where: { saleId: deB.sale.id } }),
    }));
    expect(vistoPorA).toEqual({ receitas: 0, arquivos: 0, inconsistencias: 0 });

    const vistoPorB = await comEmpresa(b.id, () => db.receita.count({ where: { saleId: deB.sale.id } }));
    expect(vistoPorB).toBe(1);
  });
});
