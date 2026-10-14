import { describe, expect, it } from 'vitest';
import prisma from '../src/db';
import { comEmpresa } from '../src/tenant';
import { criarBranch, criarCompany, criarProduto, criarUser } from './factories';
import { como } from './http';

const dia = 24 * 60 * 60 * 1000;

function emDias(n: number) {
  return new Date(Date.now() + n * dia);
}

function criarLote(companyId: string, branchId: string, productId: string, lote: string, validade: Date, quantidade: number) {
  return comEmpresa(companyId, () =>
    prisma.lote.create({
      data: {
        id: crypto.randomUUID(),
        companyId,
        branchId,
        productId,
        lote,
        validade,
        quantidade,
        updatedAt: new Date(),
      },
    })
  );
}

async function cenario() {
  const company = await criarCompany();
  const branch = await criarBranch(company.id);
  const admin = await criarUser(company.id, {
    role: 'ADMIN',
    branchId: branch.id,
    sessionToken: crypto.randomUUID(),
    sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const vendedor = await criarUser(company.id, {
    role: 'SELLER',
    branchId: branch.id,
    sessionToken: crypto.randomUUID(),
    sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  const produto = await criarProduto(company.id, { name: 'Dipirona 500mg', barcode: 'MED-VENC' });
  await criarLote(company.id, branch.id, produto.id, 'L-VENCIDO', emDias(-5), 4);
  await criarLote(company.id, branch.id, produto.id, 'L-30DIAS', emDias(30), 5);
  await criarLote(company.id, branch.id, produto.id, 'L-300DIAS', emDias(300), 7);
  await criarLote(company.id, branch.id, produto.id, 'L-ZERADO', emDias(10), 0);

  return { company, branch, admin, vendedor, produto };
}

describe('Alerta de vencimento (T-06.01)', () => {
  it('lista vencidos e a vencer dentro do limiar, ignorando o que está fora e o saldo zerado', async () => {
    const { admin } = await cenario();

    const res = await como(admin.sessionToken!).get('/api/farmacia/vencendo');
    expect(res.status).toBe(200);
    expect(res.body.limiarDias).toBe(90);

    const lotes = res.body.lotes.map((l: any) => l.lote);
    expect(lotes).toEqual(['L-VENCIDO', 'L-30DIAS']);

    const vencido = res.body.lotes.find((l: any) => l.lote === 'L-VENCIDO');
    expect(vencido.vencido).toBe(true);
    expect(vencido.diasRestantes).toBeLessThan(0);
    expect(vencido.quantidade).toBe(4);
    expect(vencido.produtoNome).toBe('Dipirona 500mg');

    const aVencer = res.body.lotes.find((l: any) => l.lote === 'L-30DIAS');
    expect(aVencer.vencido).toBe(false);
    expect(aVencer.diasRestantes).toBe(30);
  });
});

describe('Limiar configurável (T-06.02)', () => {
  it('admin salva o limiar e o alerta passa a usá-lo; não-admin recebe 403', async () => {
    const { admin, vendedor } = await cenario();

    const proibido = await como(vendedor.sessionToken!).put('/api/farmacia/vencimento').send({ dias: 10 });
    expect(proibido.status).toBe(403);

    const invalido = await como(admin.sessionToken!).put('/api/farmacia/vencimento').send({ dias: -1 });
    expect(invalido.status).toBe(400);

    const salvo = await como(admin.sessionToken!).put('/api/farmacia/vencimento').send({ dias: 10 });
    expect(salvo.status).toBe(200);
    expect(salvo.body.limiarDias).toBe(10);

    const alerta = await como(admin.sessionToken!).get('/api/farmacia/vencendo');
    expect(alerta.body.limiarDias).toBe(10);
    expect(alerta.body.lotes.map((l: any) => l.lote)).toEqual(['L-VENCIDO']);

    const config = await como(admin.sessionToken!).get('/api/farmacia/vencimento');
    expect(config.status).toBe(200);
    expect(config.body.limiarDias).toBe(10);
  });
});
