import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { contextoAtual } from '../tenant';
import { moduloAtivo } from '../utils/modulos';
import { obterSetting, salvarSetting } from '../utils/settings';
import { requerPermissao } from '../middlewares/auth';
import { ajustarLotesAoEstoque, formatarValidade } from '../utils/fefo';
import { importarCmed } from '../utils/cmed';

// Rotas do módulo farmacia. O gating é feito pelo contrato da empresa
// (`moduloAtivo`); as rotas deste router NÃO entram no catálogo de `apis` do
// módulo, para que o status continue respondendo (informando `ativo: false`)
// quando o módulo está desligado.
const router = Router();

// Limiar de vencimento em dias (D-07): configurável por admin (D-14).
const CHAVE_LIMIAR = 'farmacia_vencimento_dias';
const LIMIAR_PADRAO = 90;
const LIMIAR_MAXIMO = 3650;

const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Dias de calendário entre hoje e a validade (negativo quando já venceu).
const diasRestantes = (validade: Date, hoje: Date) =>
    Math.round((inicioDoDia(new Date(validade)).getTime() - inicioDoDia(hoje).getTime()) / 86_400_000);

async function limiarVigente(): Promise<number> {
    const bruto = Number(await obterSetting<number>(CHAVE_LIMIAR, LIMIAR_PADRAO));
    if (!Number.isFinite(bruto) || bruto < 0) return LIMIAR_PADRAO;
    return Math.min(Math.floor(bruto), LIMIAR_MAXIMO);
}

// D-17: o alerta inclui os lotes já vencidos e os que vencem dentro do limiar.
async function alertaVencimento() {
    const limiarDias = await limiarVigente();
    const hoje = inicioDoDia(new Date());
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() + limiarDias);

    const lotes = await prisma.lote.findMany({
        where: { quantidade: { gt: 0 }, validade: { lte: limite } },
        orderBy: [{ validade: 'asc' }, { lote: 'asc' }],
        include: { Product: true, Branch: true }
    });

    return {
        limiarDias,
        hoje: formatarValidade(hoje),
        lotes: lotes.map((l) => {
            const dias = diasRestantes(l.validade, hoje);
            return {
                id: l.id,
                lote: l.lote,
                validade: formatarValidade(l.validade),
                quantidade: Number(l.quantidade),
                diasRestantes: dias,
                vencido: dias < 0,
                produtoId: l.productId,
                produtoNome: l.Product?.name ?? null,
                registroMS: l.Product?.registroMS ?? null,
                filialId: l.branchId,
                filialNome: l.Branch?.name ?? null
            };
        })
    };
}

router.get('/status', (_req, res) => {
    res.json({ modulo: 'farmacia', ativo: moduloAtivo('farmacia') });
});

// GET /api/farmacia/vencimento - limiar vigente do alerta (dias)
router.get('/vencimento', async (_req, res) => {
    try {
        res.json({ limiarDias: await limiarVigente() });
    } catch (error: any) {
        res.status(400).json({ erro: error.message });
    }
});

// PUT /api/farmacia/vencimento - grava o limiar (restrito ao admin, D-14)
router.put('/vencimento', requerPermissao('ADMIN'), async (req: any, res: any) => {
    try {
        const dias = Number(req.body?.dias);
        if (!Number.isInteger(dias) || dias < 0 || dias > LIMIAR_MAXIMO) {
            return res.status(400).json({ erro: `Informe o limiar em dias (0 a ${LIMIAR_MAXIMO}).` });
        }
        await salvarSetting(CHAVE_LIMIAR, dias);
        return res.json({ limiarDias: dias });
    } catch (error: any) {
        return res.status(400).json({ erro: error.message });
    }
});

// GET /api/farmacia/vencendo - lotes já vencidos e a vencer dentro do limiar
router.get('/vencendo', async (_req, res) => {
    try {
        res.json(await alertaVencimento());
    } catch (error: any) {
        res.status(400).json({ erro: error.message });
    }
});

// Conciliação de lotes (D-20). Confere as duas invariantes do livro-razão:
//  1. soma dos lotes do produto na filial ≤ estoque agregado (Inventory) — a diferença é o saldo sem lote;
//  2. saldo de cada lote = soma das suas linhas em LoteMovimento.
async function conciliacaoLotes() {
    const lotes = await prisma.lote.findMany({ include: { Product: true } });
    const produtoIds = [...new Set(lotes.map(l => l.productId))];
    const estoques = produtoIds.length
        ? await prisma.inventory.findMany({ where: { productId: { in: produtoIds }, variantId: null } })
        : [];
    const livro = lotes.length
        ? await prisma.loteMovimento.groupBy({ by: ['loteId'], _sum: { quantidade: true } })
        : [];
    const somaLivro = new Map(livro.map(l => [l.loteId, Number(l._sum.quantidade ?? 0)]));
    const arred = (n: number) => Math.round(n * 1000) / 1000;

    const grupos = new Map<string, { produtoId: string; filialId: string; nome: string; somaLotes: number }>();
    const lotesDivergentes: any[] = [];
    for (const l of lotes) {
        const chave = `${l.productId}|${l.branchId}`;
        const g = grupos.get(chave) ?? { produtoId: l.productId, filialId: l.branchId, nome: l.Product?.name ?? '', somaLotes: 0 };
        g.somaLotes = arred(g.somaLotes + Number(l.quantidade));
        grupos.set(chave, g);

        const saldo = arred(Number(l.quantidade));
        const noLivro = arred(somaLivro.get(l.id) ?? 0);
        if (saldo !== noLivro) {
            lotesDivergentes.push({ loteId: l.id, lote: l.lote, produtoId: l.productId, produtoNome: l.Product?.name ?? null, saldo, livro: noLivro, diferenca: arred(saldo - noLivro) });
        }
    }

    const produtos = [...grupos.values()].map(g => {
        const estoque = estoques
            .filter(e => e.productId === g.produtoId && e.branchId === g.filialId)
            .reduce((s, e) => s + e.quantity, 0);
        const saldoSemLote = arred(estoque - g.somaLotes);
        return {
            produtoId: g.produtoId,
            produtoNome: g.nome,
            filialId: g.filialId,
            estoque,
            somaLotes: g.somaLotes,
            saldoSemLote,
            situacao: saldoSemLote < 0 ? 'LOTES_ACIMA_DO_ESTOQUE' : 'OK'
        };
    });

    return {
        coerente: produtos.every(p => p.situacao === 'OK') && lotesDivergentes.length === 0,
        produtos,
        lotesDivergentes
    };
}

// GET /api/farmacia/lotes/conciliacao - relatório de coerência entre lotes, estoque e livro-razão
router.get('/lotes/conciliacao', async (_req, res) => {
    try {
        res.json(await conciliacaoLotes());
    } catch (error: any) {
        res.status(400).json({ erro: error.message });
    }
});

// POST /api/farmacia/lotes/conciliar - corrige as divergências (admin). O saldo físico do lote
// prevalece: o livro-razão ganha uma linha CONCILIACAO com a diferença; e lotes acima do estoque
// são baixados (vencidos primeiro) até a soma caber no estoque agregado.
router.post('/lotes/conciliar', requerPermissao('ADMIN'), async (req: any, res: any) => {
    try {
        const antes = await conciliacaoLotes();
        await prisma.$transaction(async (tx) => {
            for (const d of antes.lotesDivergentes) {
                const lote = await tx.lote.findFirst({ where: { id: d.loteId } });
                if (!lote) continue;
                await tx.loteMovimento.create({
                    data: {
                        id: randomUUID(),
                        companyId: lote.companyId,
                        loteId: lote.id,
                        tipo: 'CONCILIACAO',
                        quantidade: d.diferenca,
                        referencia: 'Conciliação: livro-razão alinhado ao saldo do lote',
                        userId: req.operador?.id ?? null,
                        createdAt: new Date()
                    }
                });
            }
            for (const p of antes.produtos.filter(x => x.situacao !== 'OK')) {
                await ajustarLotesAoEstoque(tx, p.produtoId, p.filialId, p.estoque, {
                    tipo: 'CONCILIACAO',
                    referencia: 'Conciliação: lotes acima do estoque',
                    userId: req.operador?.id ?? null
                });
            }
        });
        const depois = await conciliacaoLotes();
        return res.json({
            corrigidos: { lotes: antes.lotesDivergentes.length, produtos: antes.produtos.filter(x => x.situacao !== 'OK').length },
            ...depois
        });
    } catch (error: any) {
        return res.status(400).json({ erro: error.message });
    }
});

// GET /api/farmacia/receitas/comprador/:documento - pré-preenche o comprador (Fase 2, D-23/D-30).
// Devolve SÓ os dados do comprador da última receita com o mesmo documento — nunca paciente nem prescritor.
router.get('/receitas/comprador/:documento', async (req: any, res: any) => {
    const documento = String(req.params.documento ?? '').trim();
    if (!documento) return res.status(400).json({ erro: 'Informe o documento.' });
    const r = await prisma.receita.findFirst({
        where: { compradorDocumento: documento },
        orderBy: { createdAt: 'desc' },
        select: { compradorNome: true, compradorTipoDoc: true, compradorDocumento: true, compradorOrgao: true, compradorUf: true }
    });
    if (!r) return res.status(404).json({ erro: 'Nenhuma receita anterior com este documento.' });
    return res.json({
        nome: r.compradorNome,
        tipoDocumento: r.compradorTipoDoc,
        documento: r.compradorDocumento,
        orgaoExpedidor: r.compradorOrgao,
        uf: r.compradorUf
    });
});

// POST /api/farmacia/cmed - importa a planilha de PMC da CMED (restrito ao admin).
// D-05: a importação substitui a tabela inteira da empresa.
router.post('/cmed', requerPermissao('ADMIN'), async (req: any, res: any) => {
    try {
        const csv = typeof req.body?.csv === 'string' ? req.body.csv : (typeof req.body === 'string' ? req.body : '');
        if (!csv.trim()) {
            return res.status(400).json({ erro: 'Envie o conteúdo CSV da planilha CMED.' });
        }

        const companyId = contextoAtual()?.companyId;
        if (!companyId) {
            return res.status(400).json({ erro: 'Empresa não identificada.' });
        }

        return res.json({ importados: await importarCmed(companyId, csv) });
    } catch (error: any) {
        return res.status(400).json({ erro: error.message });
    }
});

export default router;
