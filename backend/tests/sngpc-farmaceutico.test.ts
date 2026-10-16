import { afterAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { prisma } from './factories';
import { cenarioSngpc, cpfValido } from './sngpc-factories';
import { como } from './http';
import { autenticar, requerFarmaceuticoRT } from '../src/middlewares/auth';

// T-02.03 — operador farmacêutico RT (D-06) e middleware requerFarmaceuticoRT.

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Operador farmacêutico RT (T-02.03)', () => {
  it('valida o CPF, grava CPF/CRF/UF e só os devolve na leitura autenticada', async () => {
    const c = await cenarioSngpc();

    const invalido = await como(c.tokenAdmin).put(`/api/auth/operadores/${c.caixa.id}`)
      .send({ farmaceuticoRT: true, cpf: '123.456.789-00', crf: '999', crfUf: 'AM' });
    expect(invalido.status).toBe(400);
    expect(invalido.body.erro).toMatch(/CPF/);

    const semCrf = await como(c.tokenAdmin).put(`/api/auth/operadores/${c.caixa.id}`)
      .send({ farmaceuticoRT: true, cpf: cpfValido() });
    expect(semCrf.status).toBe(400);

    const cpf = cpfValido();
    const ok = await como(c.tokenAdmin).put(`/api/auth/operadores/${c.caixa.id}`)
      .send({ farmaceuticoRT: true, cpf: `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`, crf: '999', crfUf: 'am' });
    expect(ok.status).toBe(200);

    const lido = await como(c.tokenAdmin).get(`/api/auth/operadores/${c.caixa.id}`);
    expect(lido.status).toBe(200);
    expect(lido.body).toMatchObject({ farmaceuticoRT: true, cpf, crf: '999', crfUf: 'AM' });

    // a lista pública (tela de login, só cookie) mostra a marca de RT mas nunca o CPF
    const publica = await request((await import('../src/app')).default)
      .get('/api/auth/operadores').set('Cookie', `jg_empresa=${c.company.id}`);
    const doCaixa = publica.body.find((o: any) => o.id === c.caixa.id);
    expect(doCaixa).toBeDefined();
    expect(doCaixa.farmaceuticoRT).toBe(true);
    expect(doCaixa.cpf).toBeUndefined();
    const vendedorLe = await como(c.tokenCaixa).get(`/api/auth/operadores/${c.rt.id}`);
    expect(vendedorLe.status).toBe(403);
  });

  it('requerFarmaceuticoRT: 403 para ADMIN sem a marca e 200 para o RT', async () => {
    const c = await cenarioSngpc();
    const app = express();
    app.use(autenticar);
    app.get('/so-rt', requerFarmaceuticoRT, (_req, res) => { res.json({ ok: true }); });

    const admin = await request(app).get('/so-rt').set('Authorization', `Bearer ${c.tokenAdmin}`);
    expect(admin.status).toBe(403);
    const rt = await request(app).get('/so-rt').set('Authorization', `Bearer ${c.tokenRt}`);
    expect(rt.status).toBe(200);
  });
});
