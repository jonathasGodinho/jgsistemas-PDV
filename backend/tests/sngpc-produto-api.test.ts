import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './factories';
import { cenarioSngpc } from './sngpc-factories';
import { como } from './http';

// T-02.02 — campos SNGPC na API de produtos (D-07, contrato C-01/C-02).

afterAll(async () => {
  await prisma.$disconnect();
});

const unico = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

describe('API de produto com campos SNGPC (T-02.02)', () => {
  it('classe exige registroMS; com registroMS grava classe, lista B1 e unidade 2', async () => {
    const { tokenAdmin } = await cenarioSngpc();
    const base = { nome: `CLONAZEPAM ${unico()}`, codigo: `789${unico()}`, preco: 10, custo: 5, estoque: 0 };

    const semRegistro = await como(tokenAdmin).post('/api/produtos').send({ ...base, classeSngpc: 'CONTROLADO', listaPortaria344: 'B1' });
    expect(semRegistro.status).toBe(400);
    expect(semRegistro.body.erro).toMatch(/Registro MS/);

    const ok = await como(tokenAdmin).post('/api/produtos').send({
      ...base, registroMS: '1234567890123', classeSngpc: 'CONTROLADO', listaPortaria344: 'b1', unidadeSngpc: 2, qtdMaxReceita: 3,
    });
    expect(ok.status).toBe(201);
    const gravado = await prisma.product.findFirst({ where: { barcode: base.codigo } });
    expect(gravado?.classeSngpc).toBe('CONTROLADO');
    expect(gravado?.listaPortaria344).toBe('B1');
    expect(gravado?.unidadeSngpc).toBe(2);
    expect(gravado?.qtdMaxReceita).toBe(3);

    const lista = await como(tokenAdmin).get(`/api/produtos?busca=${encodeURIComponent(base.nome)}`);
    const item = lista.body.find((p: any) => p.codigo === base.codigo);
    expect(item).toMatchObject({ classeSngpc: 'CONTROLADO', listaPortaria344: 'B1', unidadeSngpc: 2, qtdMaxReceita: 3 });
  });

  it('lista só vale para controlado e o GET por código devolve o tipo de receituário derivado', async () => {
    const { tokenAdmin, produto } = await cenarioSngpc();

    const invalido = await como(tokenAdmin).put(`/api/produtos/${produto.id}`).send({ classeSngpc: 'ANTIMICROBIANO', listaPortaria344: 'B1' });
    expect(invalido.status).toBe(400);
    expect(invalido.body.erro).toMatch(/controlado/i);

    const listaInvalida = await como(tokenAdmin).put(`/api/produtos/${produto.id}`).send({ classeSngpc: 'CONTROLADO', listaPortaria344: 'Z9' });
    expect(listaInvalida.status).toBe(400);

    const porCodigo = await como(tokenAdmin).get(`/api/produtos/${produto.barcode}`);
    expect(porCodigo.status).toBe(200);
    expect(porCodigo.body).toMatchObject({ classeSngpc: 'CONTROLADO', listaPortaria344: 'B1', unidadeSngpc: 1, tipoReceituario: 2 });

    // remover a classe limpa a lista e deixa o produto comum (tipoReceituario null)
    const limpo = await como(tokenAdmin).put(`/api/produtos/${produto.id}`).send({ classeSngpc: null });
    expect(limpo.status).toBe(200);
    const relido = await como(tokenAdmin).get(`/api/produtos/${produto.barcode}`);
    expect(relido.body.classeSngpc).toBeNull();
    expect(relido.body.listaPortaria344).toBeNull();
    expect(relido.body.tipoReceituario).toBeNull();
  });
});
