import { afterAll, describe, expect, it } from 'vitest';
import db from '../src/db';
import { comEmpresa } from '../src/tenant';
import { prisma } from './factories';
import { cenarioSngpc } from './sngpc-factories';
import { contar, textoEm, textosEm } from './sngpc-xml';
import { montarInventario } from '../src/utils/sngpc/inventario';

// T-06.01 — XML de inventário do SNGPC (Guia v2.3 §3; D-15, D-18).

afterAll(async () => {
  await prisma.$disconnect();
});

describe('XML de inventário (T-06.01)', () => {
  it('dois lotes de B1 geram dois medicamentoEntrada com registro, lote, quantidade e classe 2', async () => {
    const c = await cenarioSngpc();
    const r = await comEmpresa(c.company.id, () => montarInventario(db, { filialId: c.branch.id, data: new Date(), cpfTransmissor: c.rt.cpf! }));
    expect(r.pendencias).toEqual([]);
    const xml = r.xml!;
    expect(xml.startsWith('<?xml version="1.0" encoding="iso-8859-1"')).toBe(true);
    expect(textoEm(xml, 'mensagemSNGPCInventario/cabecalho/cnpjEmissor')).toBe(c.branch.document);
    expect(textoEm(xml, 'cabecalho/cpfTransmissor')).toBe(c.rt.cpf);
    expect(contar(xml, 'medicamentoEntrada')).toBe(2);
    expect(textosEm(xml, 'medicamentoEntrada/numeroLoteMedicamento')).toEqual(['L-A', 'L-B']);
    expect(textosEm(xml, 'medicamentoEntrada/quantidadeMedicamento')).toEqual(['3', '10']);
    expect(textosEm(xml, 'medicamentoEntrada/classeTerapeutica')).toEqual(['2', '2']);
    expect(textosEm(xml, 'medicamentoEntrada/registroMSMedicamento')).toEqual([c.produto.registroMS, c.produto.registroMS]);
    expect(textosEm(xml, 'medicamentoEntrada/unidadeMedidaMedicamento')).toEqual(['1', '1']);
  });

  it('produto SNGPC com saldo sem lote devolve a pendência SALDO_SEM_LOTE e nenhum XML', async () => {
    const c = await cenarioSngpc({ estoque: 15 }); // lotes somam 13
    const r = await comEmpresa(c.company.id, () => montarInventario(db, { filialId: c.branch.id, data: new Date(), cpfTransmissor: c.rt.cpf! }));
    expect(r.xml).toBeNull();
    expect(r.pendencias.map(p => p.codigo)).toEqual(['SALDO_SEM_LOTE']);
    expect(r.pendencias[0].produto).toBe(c.produto.name);
  });
});
