import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './factories';
import { cenarioSngpc } from './sngpc-factories';
import { como } from './http';

// T-06.06 — painel do SNGPC (prazo de 7 dias, RDC 22 art. 10 §3º), marcar enviado e inconsistência notificada (D-16, D-19).

afterAll(async () => {
  await prisma.$disconnect();
});

function arquivo(c: Awaited<ReturnType<typeof cenarioSngpc>>, diasAtras: number) {
  const fim = new Date(Date.now() - diasAtras * 864e5); fim.setHours(0, 0, 0, 0);
  return prisma.sngpcArquivo.create({
    data: {
      id: crypto.randomUUID(), companyId: c.company.id, branchId: c.branch.id, tipo: 'MOVIMENTACAO',
      dataInicio: fim, dataFim: fim, hash: 'c'.repeat(32), xml: '<x/>', zipBase64: 'eA==', criadoPorId: c.rt.id,
    },
  });
}

describe('Painel SNGPC (T-06.06)', () => {
  it('último arquivo de 8 dias atrás dá alertaPrazo true e conta as inconsistências abertas', async () => {
    const c = await cenarioSngpc();
    const a = await arquivo(c, 8);
    await prisma.sngpcInconsistencia.create({ data: { id: crypto.randomUUID(), companyId: c.company.id, branchId: c.branch.id, arquivoId: a.id, descricao: 'x' } });
    const res = await como(c.tokenRt).get('/api/farmacia/sngpc/painel');
    expect(res.status).toBe(200);
    expect(res.body.ultimoArquivo.id).toBe(a.id);
    expect(res.body.diasDesdeUltimo).toBe(8);
    expect(res.body.alertaPrazo).toBe(true);
    expect(res.body.inconsistenciasAbertas).toHaveLength(1);
    expect(Array.isArray(res.body.pendencias)).toBe(true);

    const recente = await cenarioSngpc();
    await arquivo(recente, 2);
    const ok = await como(recente.tokenRt).get('/api/farmacia/sngpc/painel');
    expect(ok.body.alertaPrazo).toBe(false);
  });

  it('marcar enviado muda o status e grava quem enviou; inconsistência vira NOTIFICADA', async () => {
    const c = await cenarioSngpc();
    const a = await arquivo(c, 1);
    const env = await como(c.tokenRt).post(`/api/farmacia/sngpc/arquivos/${a.id}/enviado`).send({ observacao: 'Recebido com hash conferido' });
    expect(env.status).toBe(200);
    const lido = await prisma.sngpcArquivo.findUnique({ where: { id: a.id } });
    expect(lido).toMatchObject({ status: 'ENVIADO', enviadoPorId: c.rt.id, observacao: 'Recebido com hash conferido' });
    expect(lido?.enviadoEm).not.toBeNull();

    const inc = await prisma.sngpcInconsistencia.create({ data: { id: crypto.randomUUID(), companyId: c.company.id, branchId: c.branch.id, descricao: 'x' } });
    const not = await como(c.tokenRt).post(`/api/farmacia/sngpc/inconsistencias/${inc.id}/notificada`).send({});
    expect(not.status).toBe(200);
    expect((await prisma.sngpcInconsistencia.findUnique({ where: { id: inc.id } }))?.status).toBe('NOTIFICADA');
  });
});
