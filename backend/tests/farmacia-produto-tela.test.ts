import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma, criarBranch, criarCompany, criarUser } from './factories';
import { como } from './http';

afterAll(async () => {
  await prisma.$disconnect();
});

async function cenario() {
  const company = await criarCompany();
  const branch = await criarBranch(company.id);
  const token = `sessao-${crypto.randomUUID()}`;
  await criarUser(company.id, {
    branchId: branch.id,
    role: 'ADMIN',
    sessionToken: token,
    sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return { token };
}

describe('campos de farmácia na tela de produto (T-03.02)', () => {
  it('a tela traz os quatro campos, a aba e o bloqueio pelo módulo', () => {
    const html = readFileSync(resolve(process.cwd(), '../frontend/produto.html'), 'utf8');

    expect(html).toContain('id="p-principio-ativo"');
    expect(html).toContain('id="p-tipo-medicamento"');
    expect(html).toContain('id="p-registro-ms"');
    expect(html).toContain('id="p-pmc"');
    expect(html).toContain('data-aba="farmacia"');
    expect(html).toContain("moduloOk('farmacia')");
    expect(html).toContain("corpo.principioAtivo");
    expect(html).toContain("addEventListener('jg:modulos'");
  });

  it('envia os campos como a tela monta e relê no cadastro', async () => {
    const { token } = await cenario();
    const nome = `PARACETAMOL ${Date.now()}`;

    // Payload exatamente como salvarProduto() monta quando o módulo está ativo.
    const criar = await como(token).post('/api/produtos').send({
      nome,
      preco: 7.5,
      estoque: 3,
      ncm: '',
      cest: '',
      cfop: '',
      csosn: '',
      cst: '',
      principioAtivo: 'Paracetamol',
      tipoMedicamento: 'REFERENCIA',
      registroMS: '1.2345.6789.0123',
      pmc: 11.9,
      variantes: [],
    });
    expect(criar.status).toBe(201);
    const id = criar.body.id ?? criar.body.produto?.id;
    expect(id).toBeTruthy();

    const busca = await como(token).get(`/api/produtos?busca=${encodeURIComponent(nome)}`);
    const item = busca.body.find((p: { nome: string }) => p.nome === nome.toUpperCase());
    expect(item.tipoMedicamento).toBe('REFERENCIA');
    // A tela envia o registro formatado; a API guarda apenas os dígitos.
    expect(item.registroMS).toBe('1234567890123');
    expect(item.pmc).toBe(11.9);

    // Limpar na tela envia strings vazias e pmc null — deve gravar nulo.
    const limpar = await como(token).put(`/api/produtos/${id}`).send({
      principioAtivo: '',
      tipoMedicamento: '',
      registroMS: '',
      pmc: null,
    });
    expect(limpar.status).toBe(200);

    const reler = await como(token).get(`/api/produtos?busca=${encodeURIComponent(nome)}`);
    const limpo = reler.body.find((p: { nome: string }) => p.nome === nome.toUpperCase());
    expect(limpo.principioAtivo).toBeNull();
    expect(limpo.tipoMedicamento).toBeNull();
    expect(limpo.registroMS).toBeNull();
    expect(limpo.pmc).toBeNull();
  });
});
