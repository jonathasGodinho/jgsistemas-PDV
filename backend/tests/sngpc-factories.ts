import bcrypt from 'bcryptjs';
import { prisma, criarBranch, criarCompany, criarProduto, criarUser } from './factories';

// Cenário padrão do SNGPC (T-01.03): empresa e filial com CNPJ, administrador (sem marca de RT),
// farmacêutico RT com CPF/CRF, caixa aberto, fornecedor com CNPJ e um produto SNGPC com dois
// lotes já lançados no livro-razão (SALDO_INICIAL), coerente com o estoque agregado.

export const SENHA_ADMIN = 'senha-admin-123';
const dia = 24 * 60 * 60 * 1000;
export const emDias = (n: number) => new Date(Date.now() + n * dia);

let seq = 0;
function digitos(n: number) {
  seq += 1;
  const base = `${Date.now()}${seq}${Math.floor(Math.random() * 1e6)}`;
  return base.slice(-n).padStart(n, '7');
}

/** CPF com dígitos verificadores válidos. */
export function cpfValido(): string {
  const base = digitos(9).split('').map(Number);
  const dv = (nums: number[]) => {
    const soma = nums.reduce((s, d, i) => s + d * (nums.length + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  return [...base, d1, d2].join('');
}

const sessao = () => ({
  sessionToken: `sessao-${crypto.randomUUID()}`,
  sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
});

export type OpcoesCenario = {
  classe?: 'CONTROLADO' | 'ANTIMICROBIANO';
  lista?: string | null;
  lotes?: [string, Date, number][];
  estoque?: number;
  qtdMaxReceita?: number | null;
};

export async function cenarioSngpc(op: OpcoesCenario = {}) {
  const classe = op.classe ?? 'CONTROLADO';
  const lista = classe === 'CONTROLADO' ? (op.lista === undefined ? 'B1' : op.lista) : null;
  const lotesDef = op.lotes ?? [['L-A', emDias(60), 3], ['L-B', emDias(400), 10]];
  const estoque = op.estoque ?? lotesDef.reduce((s, l) => s + l[2], 0);

  const company = await criarCompany({ document: digitos(14), state: 'AM', city: 'Manaus' });
  const branch = await criarBranch(company.id, { document: digitos(14), state: 'AM' });
  const senha = await bcrypt.hash(SENHA_ADMIN, 4);
  const admin = await criarUser(company.id, { branchId: branch.id, role: 'ADMIN', password: senha, ...sessao() });
  const rt = await criarUser(company.id, {
    branchId: branch.id, role: 'MANAGER', farmaceuticoRT: true, cpf: cpfValido(), crf: '1234', crfUf: 'AM', ...sessao(),
  });
  const caixa = await criarUser(company.id, { branchId: branch.id, role: 'SELLER', ...sessao() });
  await prisma.cashRegister.create({
    data: { id: crypto.randomUUID(), companyId: company.id, branchId: branch.id, userId: admin.id, status: 'OPEN' },
  });
  const fornecedor = await prisma.supplier.create({
    data: { id: crypto.randomUUID(), companyId: company.id, name: 'Distribuidora Teste', document: digitos(14), updatedAt: new Date() } as never,
  });
  const produto = await criarProduto(company.id, {
    barcode: `SNGPC-${digitos(8)}`,
    name: classe === 'CONTROLADO' ? 'Clonazepam 2mg' : 'Amoxicilina 500mg',
    salePrice: 10,
    costPrice: 5,
    registroMS: digitos(13),
    classeSngpc: classe,
    listaPortaria344: lista,
    unidadeSngpc: 1,
    qtdMaxReceita: op.qtdMaxReceita ?? null,
  });
  await prisma.inventory.create({
    data: {
      id: crypto.randomUUID(), productId: produto.id, branchId: branch.id, quantity: estoque,
      minQuantity: 0, maxQuantity: 0, createdAt: new Date(), updatedAt: new Date(),
    },
  });
  const lotes = [];
  for (const [nome, validade, quantidade] of lotesDef) {
    const lote = await prisma.lote.create({
      data: {
        id: crypto.randomUUID(), companyId: company.id, branchId: branch.id, productId: produto.id,
        lote: nome, validade, quantidade, updatedAt: new Date(),
      },
    });
    if (quantidade !== 0) {
      await prisma.loteMovimento.create({
        data: { id: crypto.randomUUID(), companyId: company.id, loteId: lote.id, tipo: 'SALDO_INICIAL', quantidade },
      });
    }
    lotes.push(lote);
  }
  return {
    company, branch, admin, rt, caixa, fornecedor, produto, lotes,
    tokenAdmin: admin.sessionToken!, tokenRt: rt.sessionToken!, tokenCaixa: caixa.sessionToken!,
  };
}

/** Receita válida no formato do contrato C-02 (comprador para controlado, paciente para antimicrobiano). */
export function receitaValida(over: Record<string, unknown> = {}) {
  const hoje = new Date();
  const d = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  return {
    numero: '12003',
    dataPrescricao: d,
    uso: 1,
    prescritor: { nome: 'Jacinto Aquino', conselho: 'CRM', numero: '12345', uf: 'AM' },
    comprador: { nome: 'Antenor Nascente', tipoDocumento: 2, documento: '99878A', orgaoExpedidor: 'SSP', uf: 'AM' },
    paciente: { nome: 'Paciente Teste', idade: 40, unidadeIdade: 1, sexo: 1 },
    ...over,
  };
}

/** Data AAAA-MM-DD de `n` dias atrás. */
export function diasAtras(n: number): string {
  const d = new Date(Date.now() - n * dia);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
