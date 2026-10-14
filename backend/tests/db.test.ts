import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Cliente cru (sem a extensão multiempresa de src/db.ts): o banco de teste é
// semeado livremente pelas factories, sem contexto de tenant.
const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ambiente de teste com banco isolado (T-01.02)', () => {
  it('aponta para o banco de teste e nunca para a produção', () => {
    const url = process.env.DATABASE_URL ?? '';
    expect(url).toContain('jg_test');
    expect(url).not.toContain('supabase');
  });

  it('cria e lê um Company no banco de teste', async () => {
    const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const criado = await prisma.company.create({
      data: {
        id: `company-${sufixo}`,
        name: 'Empresa Teste',
        tradeName: 'Teste',
        document: `doc-${sufixo}`,
        updatedAt: new Date(),
      },
    });

    const lido = await prisma.company.findUnique({ where: { id: criado.id } });

    expect(criado.id).toBeTruthy();
    expect(lido?.id).toBe(criado.id);
    expect(lido?.name).toBe('Empresa Teste');
  });
});
