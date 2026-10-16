import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { requerPermissao } from '../middlewares/auth';
import { ajustarLotesAoEstoque, entradaEmLote, formatarValidade, rotuloLotes, saidaDeLote } from '../utils/fefo';

const router = Router();

// GET /api/estoque - Posição de estoque dos produtos (com situação)
router.get('/', async (req: any, res: any) => {
    const { busca, baixo } = req.query;

    const where: any = {};
    if (busca) {
        where.OR = [
            { name: { contains: String(busca), mode: 'insensitive' } },
            { barcode: { contains: String(busca) } },
            { sku: { contains: String(busca), mode: 'insensitive' } }
        ];
    }

    const produtos = await prisma.product.findMany({
        where,
        include: {
            ProductVariant: true,
            Inventory: { include: { ProductVariant: true } }
        },
        orderBy: { name: 'asc' }
    });

    // Farmacia: saldo por lote (FEFO consome os lotes; a tela mostra um saldo por lote).
    const lotes = produtos.length
        ? await prisma.lote.findMany({
            where: { productId: { in: produtos.map(p => p.id) } },
            orderBy: [{ validade: 'asc' }, { lote: 'asc' }]
        })
        : [];
    const lotesPorProduto = new Map<string, { id: string; lote: string; validade: Date; quantidade: number }[]>();
    for (const l of lotes) {
        const lista = lotesPorProduto.get(l.productId) ?? [];
        lista.push({ id: l.id, lote: l.lote, validade: l.validade, quantidade: Number(l.quantidade) });
        lotesPorProduto.set(l.productId, lista);
    }

    let resultado: any[] = [];
    for (const p of produtos) {
        // Linha principal (estoque base)
        const base = p.Inventory.filter(i => !i.variantId);
        const quantidade = base.reduce((s, i) => s + i.quantity, 0);
        const minimo = base.reduce((s, i) => s + i.minQuantity, 0);
        const maximo = base.reduce((s, i) => s + (i.maxQuantity ?? 0), 0);

        let situacao = 'OK';
        if (quantidade <= 0) situacao = 'SEM_ESTOQUE';
        else if (quantidade <= minimo) situacao = 'BAIXO';

        // Farmácia (D-20): parte do estoque que não está em nenhum lote
        const lotesDoProduto = lotesPorProduto.get(p.id);
        const saldoSemLote = lotesDoProduto
            ? Math.round((quantidade - lotesDoProduto.reduce((s, l) => s + l.quantidade, 0)) * 1000) / 1000
            : null;

        resultado.push({
            id: p.id,
            nome: p.name,
            codigo: p.barcode,
            sku: p.sku,
            quantidade,
            minimo,
            maximo,
            situacao,
            grade: null,
            ...(saldoSemLote !== null ? { saldoSemLote } : {})
        });

        // Linhas de lote (farmacia): um saldo por lote, com validade
        for (const l of lotesPorProduto.get(p.id) ?? []) {
            let situacaoLote = 'OK';
            if (l.quantidade <= 0) situacaoLote = 'SEM_ESTOQUE';

            resultado.push({
                id: p.id,
                nome: p.name,
                codigo: null,
                sku: null,
                loteId: l.id,
                lote: l.lote,
                validade: l.validade,
                quantidade: l.quantidade,
                minimo: 0,
                maximo: 0,
                situacao: situacaoLote,
                grade: rotuloLote(l.lote, l.validade),
                tipo: 'LOTE'
            });
        }

        // Linhas de variantes (grade cor/tamanho)
        for (const v of p.ProductVariant) {
            const invs = p.Inventory.filter(i => i.variantId === v.id);
            const qtdV = invs.reduce((s, i) => s + i.quantity, 0);
            const minV = invs.reduce((s, i) => s + i.minQuantity, 0);

            let situacaoV = 'OK';
            if (qtdV <= 0) situacaoV = 'SEM_ESTOQUE';
            else if (qtdV <= minV) situacaoV = 'BAIXO';

            resultado.push({
                id: p.id,
                nome: p.name,
                codigo: v.barcode ?? v.sku ?? p.barcode,
                sku: v.sku,
                quantidade: qtdV,
                minimo: minV,
                maximo: invs.reduce((s, i) => s + (i.maxQuantity ?? 0), 0),
                situacao: situacaoV,
                grade: `${v.color ? v.color : ''}${v.size ? ' ' + v.size : ''}`.trim() || 'VARIANTE'
            });
        }
    }

    if (baixo === 'true') {
        resultado = resultado.filter(p => p.situacao !== 'OK');
    }

    return res.json(resultado);
});

// GET /api/estoque/movimentacoes - Histórico de movimentações
router.get('/movimentacoes', async (_req: any, res: any) => {
    const movs = await prisma.inventoryMovement.findMany({
        include: {
            Inventory: { include: { Product: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 100
    });

    const userIds = [...new Set(movs.map(m => m.userId).filter(Boolean))] as string[];
    const usuarios = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
    const nomes = new Map(usuarios.map(u => [u.id, u.name]));

    return res.json(movs.map(m => ({
        id: m.id,
        tipo: m.type,
        quantidade: m.quantity,
        motivo: m.reason,
        produto: m.Inventory.Product.name,
        operador: m.userId ? nomes.get(m.userId) ?? null : null,
        data: m.createdAt
    })));
});

// Farmacia (D-20): lê lote/validade opcionais do corpo. null = sem lote; { erro } = dado inválido.
function lerLoteDoCorpo(body: any): null | { erro: string } | { lote: string; validade: Date } {
    const lote = body?.lote !== undefined && body?.lote !== null ? String(body.lote).trim() : '';
    if (!lote && !body?.validade) return null;
    if (!lote) return { erro: "Informe o número do lote!" };
    const validade = body?.validade ? new Date(`${String(body.validade).slice(0, 10)}T00:00:00`) : null;
    if (!validade || Number.isNaN(validade.getTime())) return { erro: `Informe a validade do lote ${lote}!` };
    return { lote, validade };
}

// Fase 2 (D-14): produto SNGPC (controlado/antimicrobiano) — perda exige motivo st_TipoMotivoPerda 1-9.
async function produtoSngpc(produtoId: string) {
    const p = await prisma.product.findFirst({ where: { id: produtoId }, select: { classeSngpc: true } });
    return Boolean(p?.classeSngpc);
}
function motivoPerdaDoCorpo(body: any): number | null {
    const m = Number(body?.motivoPerda);
    return Number.isInteger(m) && m >= 1 && m <= 9 ? m : null;
}
const ERRO_MOTIVO = "Medicamento controlado/antimicrobiano: informe o motivo da perda do SNGPC (1 a 9)!";

// POST /api/estoque/entrada - Entrada manual de estoque (com lote/validade opcionais — farmácia)
router.post('/entrada', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'STOCKIST'), async (req: any, res: any) => {
    const { produtoId, quantidade, motivo } = req.body;
    const qtd = Math.round(Number(quantidade) || 0);

    if (!produtoId || qtd <= 0) {
        return res.status(400).json({ erro: "Informe o produto e uma quantidade válida!" });
    }
    const loteInfo = lerLoteDoCorpo(req.body);
    if (loteInfo && 'erro' in loteInfo) {
        return res.status(400).json({ erro: loteInfo.erro });
    }
    // Fase 2 (D-14): entrada de produto SNGPC exige lote e NF (número, data, CNPJ de origem)
    let nf: { nfNumero: string; nfData: Date; cnpjOrigem: string } | null = null;
    if (await produtoSngpc(produtoId)) {
        const nfNumero = String(req.body.nfNumero ?? '').trim().slice(0, 20);
        const nfData = req.body.nfData ? new Date(`${String(req.body.nfData).slice(0, 10)}T00:00:00`) : null;
        const cnpjOrigem = String(req.body.cnpjOrigem ?? '').replace(/\D/g, '');
        if (!nfNumero || !nfData || Number.isNaN(nfData.getTime()) || cnpjOrigem.length !== 14) {
            return res.status(400).json({ erro: "Entrada de medicamento controlado/antimicrobiano exige número e data da nota fiscal e CNPJ de origem!" });
        }
        if (!loteInfo) {
            return res.status(400).json({ erro: "Entrada de medicamento controlado/antimicrobiano exige lote e validade!" });
        }
        nf = { nfNumero, nfData, cnpjOrigem };
    }

    const filial = await prisma.branch.findFirst();
    if (!filial) {
        return res.status(400).json({ erro: "Filial não configurada!" });
    }

    const inv = await prisma.inventory.findFirst({
        where: { productId: produtoId, branchId: filial.id, variantId: null }
    });
    if (!inv) {
        return res.status(400).json({ erro: "Produto sem estoque cadastrado!" });
    }

    const motivoFinal = motivo || 'ENTRADA MANUAL';
    await prisma.$transaction(async (tx) => {
        await tx.inventory.update({
            where: { id: inv.id },
            data: { quantity: { increment: qtd }, updatedAt: new Date() }
        });
        if (loteInfo) {
            await entradaEmLote(tx, {
                companyId: filial.companyId,
                branchId: filial.id,
                productId: produtoId,
                lote: loteInfo.lote,
                validade: loteInfo.validade,
                quantidade: qtd
            }, { tipo: 'ENTRADA_MANUAL', referencia: motivoFinal, userId: req.operador?.id ?? null, ...(nf ?? {}) });
        }
        await tx.inventoryMovement.create({
            data: {
                id: randomUUID(),
                inventoryId: inv.id,
                type: 'IN',
                quantity: qtd,
                reason: `${motivoFinal}${loteInfo ? rotuloLotes([loteInfo]) : ''}`,
                userId: req.operador?.id ?? null,
                createdAt: new Date()
            }
        });
    });

    return res.json({ ok: true, novaQuantidade: inv.quantity + qtd });
});

// POST /api/estoque/saida - Saída manual de estoque.
// Farmácia (D-20): `loteId` opcional baixa daquele lote; sem ele, se a saída deixaria o estoque
// abaixo da soma dos lotes, o excedente sai dos lotes (vencidos primeiro).
router.post('/saida', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'STOCKIST'), async (req: any, res: any) => {
    const { produtoId, quantidade, motivo, loteId } = req.body;
    const qtd = Math.round(Number(quantidade) || 0);

    if (!produtoId || qtd <= 0) {
        return res.status(400).json({ erro: "Informe o produto e uma quantidade válida!" });
    }

    const filial = await prisma.branch.findFirst();
    if (!filial) {
        return res.status(400).json({ erro: "Filial não configurada!" });
    }

    const inv = await prisma.inventory.findFirst({
        where: { productId: produtoId, branchId: filial.id, variantId: null }
    });
    if (!inv) {
        return res.status(400).json({ erro: "Produto sem estoque cadastrado!" });
    }

    if (inv.quantity < qtd) {
        return res.status(400).json({ erro: "Estoque insuficiente para a saída!" });
    }
    const motivoPerda = motivoPerdaDoCorpo(req.body);
    if (await produtoSngpc(produtoId) && !motivoPerda) {
        return res.status(400).json({ erro: ERRO_MOTIVO });
    }

    const motivoFinal = motivo || 'SAIDA MANUAL';
    try {
        await prisma.$transaction(async (tx) => {
            const ctx = { referencia: motivoFinal, userId: req.operador?.id ?? null, motivoPerda };
            const lotesBaixados: { lote: string; validade: Date }[] = [];
            if (loteId) {
                const lote = await saidaDeLote(tx, String(loteId), qtd, ctx);
                if (lote.productId !== produtoId || lote.branchId !== filial.id) {
                    throw new Error('O lote informado não pertence a este produto!');
                }
                lotesBaixados.push(lote);
            }
            await tx.inventory.update({
                where: { id: inv.id },
                data: { quantity: { decrement: qtd }, updatedAt: new Date() }
            });
            lotesBaixados.push(...await ajustarLotesAoEstoque(tx, produtoId, filial.id, inv.quantity - qtd, { ...ctx, tipo: 'SAIDA_MANUAL' }));
            await tx.inventoryMovement.create({
                data: {
                    id: randomUUID(),
                    inventoryId: inv.id,
                    type: 'OUT',
                    quantity: -qtd,
                    reason: `${motivoFinal}${rotuloLotes(lotesBaixados)}`,
                    userId: req.operador?.id ?? null,
                    createdAt: new Date()
                }
            });
        });
    } catch (e: any) {
        return res.status(400).json({ erro: e.message });
    }

    return res.json({ ok: true, novaQuantidade: inv.quantity - qtd });
});

// POST /api/estoque/ajuste - Ajusta estoque para um valor específico.
// Farmácia (D-20): se o novo saldo ficar abaixo da soma dos lotes, os lotes são baixados
// (vencidos primeiro) para que nunca exista lote com mais unidades do que o estoque.
router.post('/ajuste', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'STOCKIST'), async (req: any, res: any) => {
    const { produtoId, quantidade, motivo } = req.body;
    const novaQtd = Math.round(Number(quantidade) || 0);

    if (!produtoId || novaQtd < 0) {
        return res.status(400).json({ erro: "Informe o produto e uma quantidade válida!" });
    }

    const filial = await prisma.branch.findFirst();
    if (!filial) {
        return res.status(400).json({ erro: "Filial não configurada!" });
    }

    const inv = await prisma.inventory.findFirst({
        where: { productId: produtoId, branchId: filial.id, variantId: null }
    });
    if (!inv) {
        return res.status(400).json({ erro: "Produto sem estoque cadastrado!" });
    }

    const delta = novaQtd - inv.quantity;
    const motivoFinal = motivo || 'AJUSTE DE INVENTÁRIO';
    const motivoPerda = motivoPerdaDoCorpo(req.body);
    if (await produtoSngpc(produtoId)) {
        if (delta > 0) {
            return res.status(400).json({ erro: "Medicamento controlado/antimicrobiano não aceita ajuste para cima: lance a entrada com nota fiscal e lote." });
        }
        if (delta < 0 && !motivoPerda) {
            return res.status(400).json({ erro: ERRO_MOTIVO });
        }
    }

    await prisma.$transaction(async (tx) => {
        await tx.inventory.update({
            where: { id: inv.id },
            data: { quantity: novaQtd, updatedAt: new Date() }
        });
        const lotesBaixados = await ajustarLotesAoEstoque(tx, produtoId, filial.id, novaQtd, {
            tipo: 'AJUSTE', referencia: motivoFinal, userId: req.operador?.id ?? null, motivoPerda
        });
        await tx.inventoryMovement.create({
            data: {
                id: randomUUID(),
                inventoryId: inv.id,
                type: 'ADJUSTMENT',
                quantity: delta,
                reason: `${motivoFinal}${rotuloLotes(lotesBaixados)}`,
                userId: req.operador?.id ?? null,
                createdAt: new Date()
            }
        });
    });

    return res.json({ ok: true, novaQuantidade: novaQtd });
});

// Farmacia: rótulo legível do lote com a validade (dd/mm/aaaa) para a lista de estoque.
function rotuloLote(lote: string, validade: Date) {
    return `Lote ${lote} · val ${formatarValidade(validade)}`;
}

export default router;