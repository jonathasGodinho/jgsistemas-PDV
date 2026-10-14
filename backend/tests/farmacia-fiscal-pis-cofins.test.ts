import { afterAll, describe, expect, it } from 'vitest';
import { calcImpostoItem } from '../src/nfe/icms';
import { montarNfce } from '../src/nfe/xml';
import { CFG, produtoFiscal, vendaFiscal } from './nfe-helpers';
import { prisma } from './factories';

/**
 * T-08.01 — PIS/COFINS monofásico para medicamento.
 *
 * Regra (D-12 e fiscal-nfce.md): medicamento de revenda é monofásico — CST 04
 * com alíquota zero. O cadastro do produto manda: se houver CST/alíquota
 * cadastrados, eles são respeitados; sem cadastro, o medicamento assume o
 * monofásico de revenda e o produto comum segue o padrão "49" (Outras).
 *
 * O CST também define o GRUPO do XML (PISAliq / PISNT / PISOutr). Emitir CST 04
 * dentro de `PISOutr` é rejeitado pela SEFAZ, por isso o grupo é calculado em
 * `calcImpostoItem` e consumido por `xml.ts`.
 */

afterAll(async () => {
    await prisma.$disconnect();
});

describe('T-08.01 — PIS/COFINS monofásico para medicamento', () => {
    it('integracao: calcImpostoItem de um medicamento com CST monofásico calcula PIS/COFINS conforme a alíquota cadastrada', () => {
        const monofasico = calcImpostoItem(
            100,
            produtoFiscal({ tipoMedicamento: 'GENERICO', pisCst: '04', pisAliq: 0, cofinsCst: '04', cofinsAliq: 0 }),
            CFG
        );

        expect(monofasico.monofasico).toBe(true);
        expect(monofasico.pis).toMatchObject({ cst: '04', grupo: 'PISNT', vBC: 100, pPIS: 0, vPIS: 0 });
        expect(monofasico.cofins).toMatchObject({ cst: '04', grupo: 'COFINSNT', vBC: 100, pCOFINS: 0, vCOFINS: 0 });

        // Cadastro tributado continua mandando (não é monofásico).
        const tributado = calcImpostoItem(
            100,
            produtoFiscal({ tipoMedicamento: 'REFERENCIA', pisCst: '01', pisAliq: 1.65, cofinsCst: '01', cofinsAliq: 7.6 }),
            CFG
        );

        expect(tributado.monofasico).toBe(false);
        expect(tributado.pis).toMatchObject({ cst: '01', grupo: 'PISAliq', pPIS: 1.65, vPIS: 1.65 });
        expect(tributado.cofins).toMatchObject({ cst: '01', grupo: 'COFINSAliq', pCOFINS: 7.6, vCOFINS: 7.6 });
    });

    it('funcional: um item medicamento retorna os tributos da regra monofásica cadastrada (CST 04, alíquota zero)', () => {
        const medicamento = calcImpostoItem(100, produtoFiscal({ tipoMedicamento: 'REFERENCIA' }), CFG);

        expect(medicamento.monofasico).toBe(true);
        expect(medicamento.pis).toMatchObject({ cst: '04', grupo: 'PISNT', pPIS: 0, vPIS: 0 });
        expect(medicamento.cofins).toMatchObject({ cst: '04', grupo: 'COFINSNT', pCOFINS: 0, vCOFINS: 0 });

        const comum = calcImpostoItem(100, produtoFiscal({ tipoMedicamento: null, registroMS: null }), CFG);

        expect(comum.monofasico).toBe(false);
        expect(comum.pis).toMatchObject({ cst: '49', grupo: 'PISOutr', vPIS: 0 });
        expect(comum.cofins).toMatchObject({ cst: '49', grupo: 'COFINSOutr', vCOFINS: 0 });
    });

    it('funcional: a NFC-e do medicamento monofásico emite os grupos PISNT/COFINSNT', () => {
        const xml = montarNfce(vendaFiscal(produtoFiscal({ tipoMedicamento: 'SIMILAR' }), 100), CFG);

        expect(xml).toContain('<PISNT>');
        expect(xml).toContain('<COFINSNT>');
        expect(xml).not.toContain('PISOutr');
        expect(xml).not.toContain('COFINSOutr');
    });
});
