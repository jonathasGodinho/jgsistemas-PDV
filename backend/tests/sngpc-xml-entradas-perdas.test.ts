import { afterAll, describe, expect, it } from 'vitest';
import db from '../src/db';
import { comEmpresa } from '../src/tenant';
import { prisma } from './factories';
import { cenarioSngpc } from './sngpc-factories';
import { como } from './http';
import { contar, textoEm, textosEm } from './sngpc-xml';
import { blocosEntradaPerda } from '../src/utils/sngpc/xmlEntradasPerdas';

// T-06.03 — blocos entradaMedicamentos (por NF) e saidaMedicamentoPerda (por motivo) — Guia v2.3 §4; D-12, D-14.

afterAll(async () => {
  await prisma.$disconnect();
});

const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const xmlDe = (b: string[]) => `<mensagemSNGPC xmlns="urn:sngpc-schema"><corpo><medicamentos>${b.join('')}</medicamentos></corpo></mensagemSNGPC>`;

describe('XML dos blocos de entrada e perda (T-06.03)', () => {
  it('entrada de compra com NF 123 gera entradaMedicamentos com a NF, o CNPJ do fornecedor e operação 1', async () => {
    const c = await cenarioSngpc();
    const pedido = await como(c.tokenAdmin).post('/api/compras').send({ fornecedorId: c.fornecedor.id, itens: [{ produtoId: c.produto.id, quantidade: 5, custoUnitario: 5 }] });
    const det = await como(c.tokenAdmin).get(`/api/compras/${pedido.body.id}`);
    const rec = await como(c.tokenAdmin).post(`/api/compras/${pedido.body.id}/receber`).send({
      nfNumero: '123', nfData: '2026-10-10', lotes: { [det.body.itens[0].id]: { lote: 'L-NF', validade: '2029-01-01' } },
    });
    expect(rec.status).toBe(200);
    const r = await comEmpresa(c.company.id, () => blocosEntradaPerda(db, { filialId: c.branch.id, inicio: hoje(), fim: hoje() }));
    expect(r.pendencias).toEqual([]);
    const xml = xmlDe(r.entradas);
    expect(contar(xml, 'entradaMedicamentos')).toBe(1);
    expect(textoEm(xml, 'notaFiscalEntradaMedicamento/numeroNotaFiscal')).toBe('123');
    expect(textoEm(xml, 'notaFiscalEntradaMedicamento/tipoOperacaoNotaFiscal')).toBe('1');
    expect(textoEm(xml, 'notaFiscalEntradaMedicamento/dataNotaFiscal')).toBe('2026-10-10');
    expect(textoEm(xml, 'notaFiscalEntradaMedicamento/cnpjOrigem')).toBe(c.fornecedor.document);
    expect(textoEm(xml, 'notaFiscalEntradaMedicamento/cnpjDestino')).toBe(c.branch.document);
    expect(textoEm(xml, 'medicamentoEntrada/numeroLoteMedicamento')).toBe('L-NF');
    expect(textoEm(xml, 'medicamentoEntrada/quantidadeMedicamento')).toBe('5');
    expect(r.perdas).toEqual([]);
  });

  it('saída manual com motivoPerda 3 de 2 unidades gera saidaMedicamentoPerda com motivo 3 e quantidade 2', async () => {
    const c = await cenarioSngpc();
    const s = await como(c.tokenAdmin).post('/api/estoque/saida').send({ produtoId: c.produto.id, quantidade: 2, motivoPerda: 3 });
    expect(s.status).toBe(200);
    const r = await comEmpresa(c.company.id, () => blocosEntradaPerda(db, { filialId: c.branch.id, inicio: hoje(), fim: hoje() }));
    const xml = xmlDe(r.perdas);
    expect(contar(xml, 'saidaMedicamentoPerda')).toBe(1);
    expect(textoEm(xml, 'saidaMedicamentoPerda/motivoPerdaMedicamento')).toBe('3');
    expect(textosEm(xml, 'medicamentoPerda/quantidadeMedicamento').map(Number).reduce((a, b) => a + b, 0)).toBe(2);
    expect(r.entradas).toEqual([]);
  });
});
