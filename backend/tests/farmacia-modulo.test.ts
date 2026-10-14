import { afterAll, describe, expect, it } from 'vitest';
import { prisma, criarBranch, criarCompany, criarUser } from './factories';
import { como } from './http';
import { moduloAtivo } from '../src/utils/modulos';
import { esquecerContrato } from '../src/utils/contrato';

afterAll(async () => {
  await prisma.$disconnect();
});

async function criarSessao(companyId: string): Promise<string> {
  const branch = await criarBranch(companyId);
  const token = `sessao-${crypto.randomUUID()}`;
  await criarUser(companyId, {
    branchId: branch.id,
    sessionToken: token,
    sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return token;
}

describe('módulo farmacia (T-02.03)', () => {
  it('sem liberação restritiva, o módulo farmacia está ativo', () => {
    delete process.env.JG_MODULOS;
    expect(moduloAtivo('farmacia')).toBe(true);
  });

  it('a liberação por variável controla moduloAtivo', () => {
    process.env.JG_MODULOS = 'produtos,orcamentos';
    expect(moduloAtivo('farmacia')).toBe(false);
    delete process.env.JG_MODULOS;
  });

  it('GET /api/farmacia/status responde 200 com o módulo ativo', async () => {
    const company = await criarCompany();
    const token = await criarSessao(company.id);

    const res = await como(token).get('/api/farmacia/status');

    expect(res.status).toBe(200);
    expect(res.body.ativo).toBe(true);
  });

  it('contrato da empresa sem farmacia desliga o módulo no status', async () => {
    const company = await criarCompany();
    await prisma.setting.create({
      data: {
        id: crypto.randomUUID(),
        companyId: company.id,
        key: 'jg_contrato',
        value: { status: 'ATIVO', modulos: ['produtos'], segmento: 'VAREJO' },
        updatedAt: new Date(),
      } as never,
    });
    esquecerContrato(company.id);
    const token = await criarSessao(company.id);

    const res = await como(token).get('/api/farmacia/status');

    expect(res.status).toBe(200);
    expect(res.body.ativo).toBe(false);
  });
});
