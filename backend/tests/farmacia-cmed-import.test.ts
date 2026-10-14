import fs from 'fs';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { importarCmed, parseCmed } from '../src/utils/cmed';
import { criarCompany, prisma } from './factories';

afterAll(async () => {
  await prisma.$disconnect();
});

const fixtureCmed = () => fs.readFileSync(path.join(__dirname, 'fixtures', 'cmed.csv'), 'utf8');

describe('Importador da planilha CMED (T-07.01)', () => {
  it('processa o CSV de fixture e grava um CmedPreco por linha válida (D-18)', async () => {
    const company = await criarCompany();

    const linhas = parseCmed(fixtureCmed());
    // A fixture tem 3 linhas válidas e 2 que devem ser ignoradas (sem registroMS / sem pmc).
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toEqual({ registroMS: '1234567890123', descricao: 'Dipirona 500mg', pmc: 12.5 });

    const importados = await importarCmed(company.id, fixtureCmed());
    expect(importados).toBe(3);

    const gravados = await prisma.cmedPreco.findMany({ where: { companyId: company.id }, orderBy: { registroMS: 'asc' } });
    expect(registros(gravados)).toEqual([
      ['1112223334445', 25],
      ['1234567890123', 12.5],
      ['9876543210987', 8.9],
    ]);
    expect(gravados.every((g) => g.companyId === company.id)).toBe(true);
  });

  it('reimportar substitui a tabela inteira (D-05)', async () => {
    const company = await criarCompany();
    const cabecalho = 'registroMS,descricao,pmc\n';

    const primeiro = await importarCmed(company.id, `${cabecalho}1,Comprimido A,1.00\n2,Comprimido B,2.50\n`);
    expect(primeiro).toBe(2);

    const segundo = await importarCmed(company.id, `${cabecalho}3,Comprimido C,3.00\n`);
    expect(segundo).toBe(1);

    const restantes = await prisma.cmedPreco.findMany({ where: { companyId: company.id } });
    expect(restantes).toHaveLength(1);
    expect(restantes[0].registroMS).toBe('3');
    expect(Number(restantes[0].pmc)).toBe(3);
  });

  it('ignora linhas sem registro MS ou com preço não numérico (D-18)', () => {
    const csv = 'registroMS,descricao,pmc\n,Ignorada,3.00\n123,Sem preco,\n456,Com preco invalido,abc\n789,Valida,9.99\n';
    const linhas = parseCmed(csv);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toEqual({ registroMS: '789', descricao: 'Valida', pmc: 9.99 });
  });
});

function registros(linhas: { registroMS: string; pmc: unknown }[]) {
  return linhas.map((l) => [l.registroMS, Number(l.pmc)]);
}
