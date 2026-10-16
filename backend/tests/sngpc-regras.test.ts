import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { conselhosPermitidos, receitaVencida, tipoReceituarioDoProduto, validadeDias } from '../src/utils/sngpc/regras';

// T-02.01 — regras de domínio do SNGPC (D-04, D-08, D-25).

const tabela = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'sngpc-tipos-receituario.json'), 'utf8'));
const dias = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe('Regras SNGPC (T-02.01)', () => {
  it('tipo de receituário derivado bate com a tabela do Guia p.19 para cada lista e para antimicrobiano', () => {
    for (const lista of ['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'C3', 'C4', 'C5']) {
      expect(tipoReceituarioDoProduto({ classeSngpc: 'CONTROLADO', listaPortaria344: lista }), lista)
        .toBe((tabela as any)[lista]);
    }
    expect(tipoReceituarioDoProduto({ classeSngpc: 'ANTIMICROBIANO', listaPortaria344: null })).toBe(tabela.ANTIMICROBIANO);
    expect(tipoReceituarioDoProduto({ classeSngpc: null, listaPortaria344: null })).toBeNull();
    expect(tipoReceituarioDoProduto({ classeSngpc: 'CONTROLADO', listaPortaria344: null })).toBeNull();
  });

  it('validade: 30 dias para os tipos 1-4 e 10 dias para o tipo 5', () => {
    expect(validadeDias(2)).toBe(30);
    expect(validadeDias(5)).toBe(10);
    expect(receitaVencida(2, dias(31))).toBe(true);
    expect(receitaVencida(2, dias(30))).toBe(false);
    expect(receitaVencida(5, dias(11))).toBe(true);
    expect(receitaVencida(5, dias(10))).toBe(false);
    // data futura (prescrição depois de hoje) também é inválida
    expect(receitaVencida(2, dias(-2))).toBe(true);
  });

  it('conselhos aceitos por classe e uso (D-25)', () => {
    expect(conselhosPermitidos('CONTROLADO', 1)).toEqual(['CRO', 'CRF', 'CRM', 'RMS']);
    expect(conselhosPermitidos('CONTROLADO', 2)).toEqual(['CRMV']);
    expect(conselhosPermitidos('ANTIMICROBIANO', 1)).toEqual(['COREN', 'CRO', 'CRF', 'CRM', 'CRMV', 'RMS']);
  });
});
