import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import db from '../src/db';
import { comEmpresa } from '../src/tenant';
import { prisma } from './factories';
import { cenarioSngpc, receitaValida } from './sngpc-factories';
import { como } from './http';
import { abrirZipBase64, filhos, textoEm } from './sngpc-xml';
import { montarMovimentacao } from '../src/utils/sngpc/movimentacao';
import { empacotar } from '../src/utils/sngpc/pacote';

// T-06.04 — mensagemSNGPC (cabeçalho + blocos na ordem do Guia) e pacote zip/base64/MD5 (D-02, D-17).

afterAll(async () => {
  await prisma.$disconnect();
});

const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('Mensagem de movimentação e pacote (T-06.04)', () => {
  it('período com compra, venda e perda gera mensagemSNGPC com blocos na ordem entrada, venda, perda', async () => {
    const c = await cenarioSngpc();
    const pedido = await como(c.tokenAdmin).post('/api/compras').send({ fornecedorId: c.fornecedor.id, itens: [{ produtoId: c.produto.id, quantidade: 5, custoUnitario: 5 }] });
    const det = await como(c.tokenAdmin).get(`/api/compras/${pedido.body.id}`);
    await como(c.tokenAdmin).post(`/api/compras/${pedido.body.id}/receber`).send({ nfNumero: '77', nfData: iso(new Date()), lotes: { [det.body.itens[0].id]: { lote: 'L-C', validade: '2029-01-01' } } });
    // perda antes da venda, para provar que a ordem é a do Guia e não a cronológica
    await como(c.tokenAdmin).post('/api/estoque/saida').send({ produtoId: c.produto.id, quantidade: 1, motivoPerda: 2 });
    await como(c.tokenAdmin).post('/api/vendas').send({ naoEmitirNfe: true, pagamento: { metodo: 'MONEY', valorRecebido: 100 }, receitas: [receitaValida()], itens: [{ codigo: c.produto.barcode, quantidade: 1, receita: 0 }] });

    const r = await comEmpresa(c.company.id, () => montarMovimentacao(db, { filialId: c.branch.id, inicio: hoje(), fim: hoje(), cpfTransmissor: c.rt.cpf! }));
    expect(r.pendencias).toEqual([]);
    const xml = r.xml!;
    expect(textoEm(xml, 'mensagemSNGPC/cabecalho/dataInicio')).toBe(iso(hoje()));
    expect(textoEm(xml, 'cabecalho/dataFim')).toBe(iso(hoje()));
    expect(textoEm(xml, 'cabecalho/cnpjEmissor')).toBe(c.branch.document);
    expect(filhos(xml, 'corpo/medicamentos')).toEqual(['entradaMedicamentos', 'saidaMedicamentoVendaAoConsumidor', 'saidaMedicamentoPerda']);
  });

  it('empacotar devolve zip base64 que abre no XML original e hash = MD5 hex do base64', () => {
    const xml = '<?xml version="1.0" encoding="iso-8859-1" ?><mensagemSNGPC xmlns="urn:sngpc-schema"><cabecalho><x>Ação</x></cabecalho></mensagemSNGPC>';
    const p = empacotar(xml, 'movimentacao.xml');
    expect(abrirZipBase64(p.zipBase64)).toMatchObject({ nome: 'movimentacao.xml', xml });
    expect(p.hash).toMatch(/^[0-9a-f]{32}$/);
    expect(p.hash).toBe(createHash('md5').update(p.zipBase64).digest('hex'));
  });
});
