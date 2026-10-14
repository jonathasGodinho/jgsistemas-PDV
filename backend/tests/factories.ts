import { PrismaClient } from '@prisma/client';

// Cliente cru para semear o banco de teste, sem a extensão multiempresa (src/db.ts).
export const prisma = new PrismaClient();

const novoId = () => crypto.randomUUID();
const unico = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type Overrides = Record<string, unknown>;

export async function criarCompany(over: Overrides = {}) {
  return prisma.company.create({
    data: {
      id: novoId(),
      name: 'Empresa Teste',
      tradeName: 'Teste',
      document: `doc-${unico()}`,
      updatedAt: new Date(),
      ...over,
    } as never,
  });
}

export async function criarBranch(companyId: string, over: Overrides = {}) {
  return prisma.branch.create({
    data: {
      id: novoId(),
      companyId,
      name: 'Filial Teste',
      updatedAt: new Date(),
      ...over,
    } as never,
  });
}

export async function criarUser(companyId: string, over: Overrides = {}) {
  return prisma.user.create({
    data: {
      id: novoId(),
      companyId,
      name: 'Usuário Teste',
      email: `user-${unico()}@teste.local`,
      password: 'senha-teste',
      updatedAt: new Date(),
      ...over,
    } as never,
  });
}

export async function criarProduto(companyId: string, over: Overrides = {}) {
  return prisma.product.create({
    data: {
      id: novoId(),
      companyId,
      name: 'Produto Teste',
      unit: 'UN',
      updatedAt: new Date(),
      ...over,
    } as never,
  });
}
