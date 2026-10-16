import { afterAll, describe, expect, it } from 'vitest';
import db from '../src/db';
import { comEmpresa } from '../src/tenant';
import { prisma } from './factories';
import { cenarioSngpc, receitaValida, SENHA_ADMIN } from './sngpc-factories';
import { como } from './http';
import { contar, textoEm, textosEm } from './sngpc-xml';
import { blocoVendas } from '../src/utils/sngpc/xmlVendas';

// T-06.02 — bloco saidaMedicamentoVendaAoConsumidor por receita (Guia v2.3 §4; D-12).

afterAll(async () => {
  await prisma.$disconnect();
});

const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const xmlDe = (blocos: string[]) => `<mensagemSNGPC xmlns="urn:sngpc-schema"><corpo><medicamentos>${blocos.join('')}</medicamentos></corpo></mensagemSNGPC>`;

function vender(token: string, corpo: Record<string, unknown>) {
  return como(token).post('/api/vendas').send({ naoEmitirNfe: true, pagamento: { metodo: 'MONEY', valorRecebido: 1000 }, ...corpo });
}

describe('XML do bloco de vendas (T-06.02)', () => {
  it('venda com dois itens B1 numa receita gera um bloco com comprador e um medicamentoVenda por lote', async () => {
    const c = await cenarioSngpc();
    const res = await vender(c.tokenAdmin, {
      receitas: [receitaValida()],
      itens: [{ codigo: c.produto.barcode, quantidade: 2, receita: 0 }, { codigo: c.produto.barcode, quantidade: 2, receita: 0 }],
    });
    expect(res.status).toBe(201);
    const r = await comEmpresa(c.company.id, () => blocoVendas(db, { filialId: c.branch.id, inicio: hoje(), fim: hoje() }));
    expect(r.pendencias).toEqual([]);
    const xml = xmlDe(r.blocos);
    expect(contar(xml, 'saidaMedicamentoVendaAoConsumidor')).toBe(1);
    expect(textoEm(xml, 'saidaMedicamentoVendaAoConsumidor/tipoReceituarioMedicamento')).toBe('2');
    expect(textoEm(xml, 'compradorMedicamento/numeroDocumento')).toBe('99878A');
    expect(textoEm(xml, 'prescritorMedicamento/conselhoProfissional')).toBe('CRM');
    expect(contar(xml, 'pacienteMedicamento')).toBe(0);
    expect(textosEm(xml, 'medicamentoVenda/numeroLoteMedicamento')).toEqual(['L-A', 'L-B']);
    expect(textosEm(xml, 'medicamentoVenda/quantidadeMedicamento')).toEqual(['3', '1']);
  });

  it('venda cancelada não gera bloco; antimicrobiano gera paciente e usoProlongado N; venda sem receita vira pendência', async () => {
    const c = await cenarioSngpc();
    await vender(c.tokenAdmin, { receitas: [receitaValida()], itens: [{ codigo: c.produto.barcode, quantidade: 1, receita: 0 }] });
    const cancelada = await prisma.sale.findFirst({ where: { companyId: c.company.id } });
    expect((await como(c.tokenAdmin).post(`/api/vendas/${cancelada!.id}/cancelar`).send({ senhaAdmin: SENHA_ADMIN })).status).toBe(200);
    let r = await comEmpresa(c.company.id, () => blocoVendas(db, { filialId: c.branch.id, inicio: hoje(), fim: hoje() }));
    expect(r.blocos).toEqual([]);

    const a = await cenarioSngpc({ classe: 'ANTIMICROBIANO' });
    await vender(a.tokenAdmin, { receitas: [receitaValida({ numero: undefined, comprador: undefined })], itens: [{ codigo: a.produto.barcode, quantidade: 1, receita: 0 }] });
    r = await comEmpresa(a.company.id, () => blocoVendas(db, { filialId: a.branch.id, inicio: hoje(), fim: hoje() }));
    const xml = xmlDe(r.blocos);
    expect(textoEm(xml, 'saidaMedicamentoVendaAoConsumidor/tipoReceituarioMedicamento')).toBe('5');
    expect(textoEm(xml, 'pacienteMedicamento/nome')).toBe('Paciente Teste');
    expect(textoEm(xml, 'medicamentoVenda/usoProlongado')).toBe('N');
    expect(contar(xml, 'compradorMedicamento')).toBe(0);

    // venda feita antes da classe SNGPC (sem receita) aparece como pendência
    const s = await cenarioSngpc();
    await prisma.product.update({ where: { id: s.produto.id }, data: { classeSngpc: null, listaPortaria344: null } });
    await vender(s.tokenAdmin, { itens: [{ codigo: s.produto.barcode, quantidade: 1 }] });
    await prisma.product.update({ where: { id: s.produto.id }, data: { classeSngpc: 'CONTROLADO', listaPortaria344: 'B1' } });
    r = await comEmpresa(s.company.id, () => blocoVendas(db, { filialId: s.branch.id, inicio: hoje(), fim: hoje() }));
    expect(r.pendencias.map(p => p.codigo)).toEqual(['VENDA_SEM_RECEITA']);
  });
});
