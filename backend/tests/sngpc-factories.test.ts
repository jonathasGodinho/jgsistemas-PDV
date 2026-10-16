import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './factories';
import { cenarioSngpc } from './sngpc-factories';
import { como } from './http';

// T-01.03 — cenário padrão do SNGPC usado pelas sprints seguintes.

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Factories do cenário SNGPC (T-01.03)', () => {
  it('cenário padrão (controlado B1 com dois lotes) está coerente na conciliação de lotes', async () => {
    const c = await cenarioSngpc();

    expect(c.company.document).toMatch(/^\d{14}$/);
    expect(c.rt.farmaceuticoRT).toBe(true);
    expect(c.rt.cpf).toMatch(/^\d{11}$/);
    expect(c.produto.classeSngpc).toBe('CONTROLADO');
    expect(c.produto.listaPortaria344).toBe('B1');
    expect(c.lotes.map(l => [l.lote, Number(l.quantidade)])).toEqual([['L-A', 3], ['L-B', 10]]);

    const conc = await como(c.tokenAdmin).get('/api/farmacia/lotes/conciliacao');
    expect(conc.status).toBe(200);
    expect(conc.body.coerente).toBe(true);
    expect(conc.body.produtos).toHaveLength(1);
    expect(conc.body.produtos[0].estoque).toBe(13);
    expect(conc.body.produtos[0].somaLotes).toBe(13);
  });

  it('cria produto antimicrobiano sem lista da Portaria 344', async () => {
    const c = await cenarioSngpc({ classe: 'ANTIMICROBIANO' });
    expect(c.produto.classeSngpc).toBe('ANTIMICROBIANO');
    expect(c.produto.listaPortaria344).toBeNull();
  });
});
