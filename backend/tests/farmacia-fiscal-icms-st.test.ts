import { afterAll, describe, expect, it } from 'vitest';
import { calcImpostoItem } from '../src/nfe/icms';
import { montarNfce } from '../src/nfe/xml';
import { CFG, produtoFiscal, vendaFiscal } from './nfe-helpers';
import { criarCompany, criarProduto, prisma } from './factories';

/**
 * T-08.02 — ICMS-ST por produto (MVA e redução), D-12.
 *
 * A MVA e a redução da base de ST são cadastradas no produto (não há fonte
 * automática na Fase 1). O item medicamento com ST restituído (CSOSN 500) calcula:
 *
 *   vBCST   = base * (1 - redução/100) * (1 + MVA/100)
 *   vICMSST = vBCST * alíquota - ICMS próprio      (nunca negativo)
 *
 * sem MVA cadastrada não há ST (`icms.st` ausente).
 */

afterAll(async () => {
    await prisma.$disconnect();
});

describe('T-08.02 — ICMS-ST por produto/NCM (MVA e redução)', () => {
    it('integracao: um item com ST cadastrado usa a MVA e a redução do produto no cálculo', async () => {
        const company = await criarCompany();
        const salvo = await criarProduto(company.id, {
            name: 'Dipirona com ST',
            tipoMedicamento: 'REFERENCIA',
            csosn: '500',
            icmsAliq: 18,
            mvaSt: 40,
            reducaoSt: 10
        });

        const imposto = calcImpostoItem(100, salvo, CFG);

        expect(imposto.icms.csosn).toBe('500');
        expect(imposto.icms.st).toMatchObject({
            vBCST: 126,
            pMVAST: 40,
            pRedBCST: 10,
            pICMSST: 18,
            vICMSST: 4.68
        });
    });

    it('funcional: produto com MVA 40% e redução 0 gera ST igual ao valor esperado pela base de cálculo', () => {
        const comSt = calcImpostoItem(
            100,
            produtoFiscal({ csosn: '500', icmsAliq: 18, mvaSt: 40, reducaoSt: 0 }),
            CFG
        );

        // vBCST = 100 * (1 + 0,40) = 140 · vICMSST = 140 * 18% - 18 = 7,20
        expect(comSt.icms.st).toMatchObject({ vBCST: 140, pMVAST: 40, pRedBCST: 0, vICMSST: 7.2 });

        const semSt = calcImpostoItem(100, produtoFiscal({ csosn: '102' }), CFG);

        expect(semSt.icms.st).toBeUndefined();
    });

    it('funcional: a NFC-e com CSOSN 500 emite o grupo ICMSST com o ST restituído', () => {
        const xml = montarNfce(
            vendaFiscal(produtoFiscal({ csosn: '500', icmsAliq: 18, mvaSt: 40, reducaoSt: 0 }), 100),
            CFG
        );

        expect(xml).toContain('<ICMSST>');
        expect(xml).toContain('<CSOSN>500</CSOSN>');
        expect(xml).toContain('<vBCSTRet>140.00</vBCSTRet>');
        expect(xml).toContain('<pST>18.00</pST>');
        expect(xml).toContain('<vICMSSTRet>7.20</vICMSSTRet>');
    });

    it('funcional: o ST retido (CSOSN 500) não é somado nos totais ICMSTot', () => {
        const xml = montarNfce(
            vendaFiscal(produtoFiscal({ csosn: '500', icmsAliq: 18, mvaSt: 40, reducaoSt: 0 }), 100),
            CFG
        );

        // O item declara o ST restituído no grupo ICMSST...
        expect(xml).toContain('<ICMSST>');
        expect(xml).toContain('<vBCSTRet>140.00</vBCSTRet>');
        // ...mas o MOC manda somar em vBCST/vST apenas o ST próprio (CST 10, 30,
        // 70, 90 e CSOSN 201, 202, 203, 900). CSOSN 500 fica fora: totais zerados.
        expect(xml).toContain('<vBCST>0.00</vBCST>');
        expect(xml).toContain('<vST>0.00</vST>');
    });
});
