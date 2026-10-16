import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './factories';
import { cenarioSngpc } from './sngpc-factories';
import { como } from './http';

// T-05.02 — movimento manual de produto SNGPC (D-14): perda com motivo st_TipoMotivoPerda,
// entrada com NF e lote, ajuste para cima recusado.

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Movimento manual de produto SNGPC (T-05.02)', () => {
  it('saída sem motivoPerda responde 400; com motivoPerda 3 grava o motivo no livro do lote', async () => {
    const c = await cenarioSngpc();
    const sem = await como(c.tokenAdmin).post('/api/estoque/saida').send({ produtoId: c.produto.id, quantidade: 1 });
    expect(sem.status).toBe(400);
    expect(sem.body.erro).toMatch(/motivo/i);

    const ok = await como(c.tokenAdmin).post('/api/estoque/saida').send({ produtoId: c.produto.id, quantidade: 2, motivoPerda: 3 });
    expect(ok.status).toBe(200);
    const perdas = await prisma.loteMovimento.findMany({ where: { companyId: c.company.id, tipo: 'SAIDA_MANUAL' } });
    expect(perdas.reduce((s, p) => s + Number(p.quantidade), 0)).toBe(-2);
    expect(perdas.every(p => p.motivoPerda === 3)).toBe(true);

    const fora = await como(c.tokenAdmin).post('/api/estoque/saida').send({ produtoId: c.produto.id, quantidade: 1, motivoPerda: 10 });
    expect(fora.status).toBe(400);
  });

  it('ajuste para cima de produto SNGPC é recusado; para baixo exige motivo; produto comum ajusta para cima', async () => {
    const c = await cenarioSngpc();
    const cima = await como(c.tokenAdmin).post('/api/estoque/ajuste').send({ produtoId: c.produto.id, quantidade: 20 });
    expect(cima.status).toBe(400);
    expect(cima.body.erro).toMatch(/para cima/i);

    const baixoSemMotivo = await como(c.tokenAdmin).post('/api/estoque/ajuste').send({ produtoId: c.produto.id, quantidade: 10 });
    expect(baixoSemMotivo.status).toBe(400);
    const baixo = await como(c.tokenAdmin).post('/api/estoque/ajuste').send({ produtoId: c.produto.id, quantidade: 10, motivoPerda: 2 });
    expect(baixo.status).toBe(200);
    const aj = await prisma.loteMovimento.findMany({ where: { companyId: c.company.id, tipo: 'AJUSTE' } });
    expect(aj.reduce((s, p) => s + Number(p.quantidade), 0)).toBe(-3);
    expect(aj.every(p => p.motivoPerda === 2)).toBe(true);

    await prisma.product.update({ where: { id: c.produto.id }, data: { classeSngpc: null, listaPortaria344: null } });
    const comum = await como(c.tokenAdmin).post('/api/estoque/ajuste').send({ produtoId: c.produto.id, quantidade: 20 });
    expect(comum.status).toBe(200);
  });

  it('entrada manual de produto SNGPC exige NF, CNPJ de origem e lote', async () => {
    const c = await cenarioSngpc();
    const semNf = await como(c.tokenAdmin).post('/api/estoque/entrada').send({ produtoId: c.produto.id, quantidade: 2, lote: 'L-X', validade: '2029-01-01' });
    expect(semNf.status).toBe(400);
    const semLote = await como(c.tokenAdmin).post('/api/estoque/entrada').send({ produtoId: c.produto.id, quantidade: 2, nfNumero: '55', nfData: '2026-10-01', cnpjOrigem: '12345678000199' });
    expect(semLote.status).toBe(400);
    const ok = await como(c.tokenAdmin).post('/api/estoque/entrada').send({
      produtoId: c.produto.id, quantidade: 2, lote: 'L-X', validade: '2029-01-01', nfNumero: '55', nfData: '2026-10-01', cnpjOrigem: '12.345.678/0001-99',
    });
    expect(ok.status).toBe(200);
    const e = await prisma.loteMovimento.findFirst({ where: { companyId: c.company.id, tipo: 'ENTRADA_MANUAL' } });
    expect(e?.nfNumero).toBe('55');
    expect(e?.cnpjOrigem).toBe('12345678000199');
  });
});
