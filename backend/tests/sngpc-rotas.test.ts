import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './factories';
import { cenarioSngpc, receitaValida, diasAtras } from './sngpc-factories';
import { como } from './http';
import { abrirZipBase64, textoEm } from './sngpc-xml';

// T-06.05 — rotas do RT: geração com período contínuo, lista e download (D-06, D-15, D-16, D-19, D-20).

afterAll(async () => {
  await prisma.$disconnect();
});

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('Rotas de geração e download do SNGPC (T-06.05)', () => {
  it('RT gera movimentação com hash; a segunda começa no dia seguinte ao fim da primeira; download devolve o zip', async () => {
    const c = await cenarioSngpc();
    await como(c.tokenAdmin).post('/api/vendas').send({ naoEmitirNfe: true, pagamento: { metodo: 'MONEY', valorRecebido: 100 }, receitas: [receitaValida()], itens: [{ codigo: c.produto.barcode, quantidade: 1, receita: 0 }] });

    const primeira = await como(c.tokenRt).post('/api/farmacia/sngpc/movimentacao').send({ dataInicio: diasAtras(3), dataFim: diasAtras(1) });
    expect(primeira.status).toBe(201);
    expect(primeira.body.hash).toMatch(/^[0-9a-f]{32}$/);
    const arq = await prisma.sngpcArquivo.findUnique({ where: { id: primeira.body.id } });
    expect(arq).toMatchObject({ tipo: 'MOVIMENTACAO', status: 'GERADO', criadoPorId: c.rt.id, hash: primeira.body.hash });

    const segunda = await como(c.tokenRt).post('/api/farmacia/sngpc/movimentacao').send({ dataFim: iso(new Date()) });
    expect(segunda.status).toBe(201);
    expect(segunda.body.dataInicio).toBe(iso(new Date()));
    const arq2 = await prisma.sngpcArquivo.findUnique({ where: { id: segunda.body.id } });
    expect(textoEm(arq2!.xml, 'cabecalho/dataInicio')).toBe(iso(new Date()));
    expect(textoEm(arq2!.xml, 'medicamentoVenda/quantidadeMedicamento')).toBe('1');

    const lista = await como(c.tokenRt).get('/api/farmacia/sngpc/arquivos');
    expect(lista.body.map((a: any) => a.id)).toEqual([segunda.body.id, primeira.body.id]);
    expect(lista.body[0].xml).toBeUndefined();

    const down = await como(c.tokenRt).get(`/api/farmacia/sngpc/arquivos/${segunda.body.id}/download`).buffer(true).parse((res, cb) => {
      const partes: Buffer[] = []; res.on('data', (d: Buffer) => partes.push(d)); res.on('end', () => cb(null, Buffer.concat(partes)));
    });
    expect(down.status).toBe(200);
    expect(down.headers['content-type']).toMatch(/zip/);
    expect(abrirZipBase64((down.body as Buffer).toString('base64')).xml).toBe(arq2!.xml);

    const auditoria = await prisma.auditLog.count({ where: { userId: c.rt.id, action: 'SNGPC_ARQUIVO_GERADO' } });
    expect(auditoria).toBe(2);
  });

  it('ADMIN sem marca de RT recebe 403; pendência devolve 422 com a lista; inventário de 8 dias atrás devolve 400', async () => {
    const c = await cenarioSngpc({ estoque: 20 }); // 7 unidades sem lote → pendência no inventário
    const admin = await como(c.tokenAdmin).post('/api/farmacia/sngpc/movimentacao').send({ dataInicio: iso(new Date()) });
    expect(admin.status).toBe(403);

    const pend = await como(c.tokenRt).post('/api/farmacia/sngpc/inventario').send({ data: iso(new Date()) });
    expect(pend.status).toBe(422);
    expect(pend.body.pendencias.map((p: any) => p.codigo)).toEqual(['SALDO_SEM_LOTE']);
    expect(await prisma.sngpcArquivo.count({ where: { companyId: c.company.id } })).toBe(0);

    const velho = await como(c.tokenRt).post('/api/farmacia/sngpc/inventario').send({ data: diasAtras(8) });
    expect(velho.status).toBe(400);
  });
});
