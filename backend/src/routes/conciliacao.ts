import { Router } from 'express';
import prisma from '../db';
import { requerPermissao } from '../middlewares/auth';
import { validarSenhaAdmin } from '../utils/autorizacao';
import { criarImportacao } from '../utils/concilia';

const router = Router();

const mapLinha = (l: any) => ({
    id: l.id,
    lineNumber: l.lineNumber,
    statementDate: l.statementDate,
    description: l.description,
    reference: l.reference,
    amount: Number(l.amount),
    status: l.status,
    notes: l.notes,
    recebivel: l.CardReceivable ? {
        id: l.CardReceivable.id,
        operadora: l.CardReceivable.CardOperator?.name,
        bandeira: l.CardReceivable.CardBrand?.name ?? 'Genérica',
        metodo: l.CardReceivable.method,
        parcela: `${l.CardReceivable.installNumber}/${l.CardReceivable.installments}`,
        venda: l.CardReceivable.Sale?.nfceNumber ?? l.CardReceivable.saleId,
        bruto: Number(l.CardReceivable.grossAmount),
        liquido: Number(l.CardReceivable.netAmount),
        vencimento: l.CardReceivable.expectedDate,
        status: l.CardReceivable.status
    } : null
});

// POST /api/conciliacao/importar
// Body: { operadoraId, conteudo, fileName?, notas? }
// Faz o parse do extrato, cria o import e tenta o match automático.
router.post('/importar', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'FINANCIAL'), async (req: any, res: any) => {
    const { operadoraId, conteudo, fileName, notas } = req.body;
    if (!operadoraId) {
        return res.status(400).json({ erro: "Informe a operadora do extrato!" });
    }
    if (!conteudo || !String(conteudo).trim()) {
        return res.status(400).json({ erro: "Informe o conteúdo do extrato!" });
    }

    const empresa = await prisma.company.findFirst();
    if (!empresa) {
        return res.status(400).json({ erro: "Empresa não configurada!" });
    }
    const operadora = await prisma.cardOperator.findUnique({ where: { id: operadoraId } });
    if (!operadora) {
        return res.status(404).json({ erro: "Operadora não encontrada!" });
    }

    try {
        const resultado = await prisma.$transaction((tx) =>
            criarImportacao({
                tx,
                companyId: empresa.id,
                operatorId: operadoraId,
                fileName,
                conteudo,
                createdById: req.operador?.id,
                notas
            })
        );
        return res.status(201).json(resultado);
    } catch (e: any) {
        return res.status(400).json({ erro: e.message || "Erro ao importar extrato." });
    }
});

// GET /api/conciliacao/importacoes
router.get('/importacoes', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'FINANCIAL'), async (_req: any, res: any) => {
    const importacoes = await prisma.cardStatementImport.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            CardOperator: { select: { name: true } },
            Line: { select: { status: true } }
        }
    });
    const StatusLabel: Record<string, string> = {
        OPEN: 'ABERTA', APPLIED: 'APLICADA', CANCELLED: 'CANCELADA'
    };
    const StatusBadge: Record<string, string> = {
        OPEN: 'b-azul', APPLIED: 'b-verde', CANCELLED: 'b-cinza'
    };
    return res.json(importacoes.map(i => ({
        id: i.id,
        operadora: i.CardOperator.name,
        arquivo: i.fileName,
        periodoInicio: i.periodStart,
        periodoFim: i.periodEnd,
        status: i.status,
        statusLabel: StatusLabel[i.status] ?? i.status,
        statusBadge: StatusBadge[i.status] ?? 'b-cinza',
        totalLinhas: i.totalLines,
        matcheadas: i.matchedLines,
        naoMatcheadas: i.unmatchedLines,
        creditAmount: Number(i.creditAmount),
        notas: i.notes,
        aplicadaEm: i.appliedAt,
        criadaEm: i.createdAt
    })));
});

// GET /api/conciliacao/importacoes/:id
router.get('/importacoes/:id', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'FINANCIAL'), async (req: any, res: any) => {
    const { id } = req.params;
    const importacao = await prisma.cardStatementImport.findUnique({
        where: { id },
        include: {
            CardOperator: { select: { name: true } },
            Line: {
                include: {
                    CardReceivable: {
                        include: {
                            CardOperator: { select: { name: true } },
                            CardBrand: { select: { name: true } },
                            Sale: { select: { nfceNumber: true } }
                        }
                    }
                },
                orderBy: { lineNumber: 'asc' }
            }
        }
    });
    if (!importacao) {
        return res.status(404).json({ erro: "Importação não encontrada!" });
    }

    const linhas = importacao.Line.map(mapLinha);
    return res.json({
        id: importacao.id,
        operadora: importacao.CardOperator.name,
        operadoraId: importacao.operatorId,
        arquivo: importacao.fileName,
        periodoInicio: importacao.periodStart,
        periodoFim: importacao.periodEnd,
        status: importacao.status,
        totalLinhas: importacao.totalLines,
        matchedLines: importacao.matchedLines,
        unmatchedLines: importacao.unmatchedLines,
        creditAmount: Number(importacao.creditAmount),
        notas: importacao.notes,
        criadaEm: importacao.createdAt,
        aplicadaEm: importacao.appliedAt,
        linhas
    });
});

// POST /api/conciliacao/importacoes/:id/linhas/:linhaId/conciliar
// Body: { recebivelId } — vínculo manual; use recebivelId: null para desfazer.
router.post('/importacoes/:id/linhas/:linhaId/conciliar', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'FINANCIAL'), async (req: any, res: any) => {
    const { id, linhaId } = req.params;
    const { recebivelId } = req.body;

    const importacao = await prisma.cardStatementImport.findUnique({ where: { id } });
    if (!importacao) {
        return res.status(404).json({ erro: "Importação não encontrada!" });
    }
    if (importacao.status !== 'OPEN') {
        return res.status(400).json({ erro: "Somente importações ABERTAS podem ser conciliadas!" });
    }
    const linha = await prisma.cardStatementLine.findUnique({ where: { id: linhaId } });
    if (!linha || linha.importId !== id) {
        return res.status(404).json({ erro: "Linha não encontrada nesta importação!" });
    }
    if (linha.status === 'APPLIED') {
        return res.status(400).json({ erro: "Linha já aplicada! Não pode ser alterada." });
    }

    let recebivelAlvo = null;
    if (recebivelId) {
        recebivelAlvo = await prisma.cardReceivable.findUnique({
            where: { id: recebivelId },
            include: { CardOperator: true, CardBrand: true, Sale: { select: { nfceNumber: true } } }
        });
        if (!recebivelAlvo) {
            return res.status(404).json({ erro: "Recebível não encontrado!" });
        }
        if (recebivelAlvo.operatorId !== importacao.operatorId) {
            return res.status(400).json({ erro: "O recebível é de outra operadora!" });
        }
        if (recebivelAlvo.status !== 'PENDING') {
            return res.status(400).json({ erro: "O recebível não está mais PENDENTE!" });
        }
    }

    const atualizada = await prisma.$transaction(async (tx) => {
        const reg = await tx.cardStatementLine.update({
            where: { id: linhaId },
            data: {
                matchedReceivableId: recebivelId || null,
                status: recebivelId ? 'MATCHED' : 'UNMATCHED',
                notes: recebivelId ? 'Conciliado manualmente' : 'Desfeita conciliação'
            },
            include: {
                CardReceivable: {
                    include: {
                        CardOperator: { select: { name: true } },
                        CardBrand: { select: { name: true } },
                        Sale: { select: { nfceNumber: true } }
                    }
                }
            }
        });

        const demais = await tx.cardStatementLine.findMany({
            where: { importId: id },
            select: { status: true }
        });
        const matched = demais.filter(l => l.status === 'MATCHED').length;
        await tx.cardStatementImport.update({
            where: { id },
            data: {
                matchedLines: matched,
                unmatchedLines: demais.length - matched,
                updatedAt: new Date()
            }
        });
        return reg;
    });

    return res.json({ ok: true, linha: mapLinha(atualizada) });
});

// POST /api/conciliacao/importacoes/:id/aplicar
// Body: { senhaAdmin } — exige senha do administrador.
// Baixa os recebíveis MATCHED (→ PAID) e as contas CARTÃO do financeiro, e marca a importação APPLIED.
router.post('/importacoes/:id/aplicar', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'FINANCIAL'), async (req: any, res: any) => {
    const { id } = req.params;
    const { senhaAdmin } = req.body;

    if (!(await validarSenhaAdmin(senhaAdmin ?? ''))) {
        return res.status(400).json({ erro: "Senha do administrador incorreta!" });
    }

    const importacao = await prisma.cardStatementImport.findUnique({ where: { id } });
    if (!importacao) {
        return res.status(404).json({ erro: "Importação não encontrada!" });
    }
    if (importacao.status === 'APPLIED') {
        return res.status(400).json({ erro: "Importação já aplicada!" });
    }
    if (importacao.status === 'CANCELLED') {
        return res.status(400).json({ erro: "Importação cancelada não pode ser aplicada!" });
    }

    const linhasMatched = await prisma.cardStatementLine.findMany({
        where: { importId: id, status: 'MATCHED', matchedReceivableId: { not: null } }
    });
    if (linhasMatched.length === 0) {
        return res.status(400).json({ erro: "Nenhuma linha MATCHED para aplicar!" });
    }

    const resultado = await prisma.$transaction(async (tx) => {
        let baixados = 0;
        let valorBaixado = 0;

        for (const linha of linhasMatched) {
            const recebivel = await tx.cardReceivable.findUnique({
                where: { id: linha.matchedReceivableId! }
            });
            if (!recebivel || recebivel.status !== 'PENDING') {
                continue;
            }

            const reg = await tx.cardReceivable.update({
                where: { id: recebivel.id },
                data: { status: 'PAID', paidDate: new Date(), updatedAt: new Date() }
            });

            const conta = await tx.financialTransaction.findFirst({
                where: { cardReceivableId: recebivel.id }
            });
            if (conta && conta.status !== 'PAID') {
                await tx.financialTransaction.update({
                    where: { id: conta.id },
                    data: {
                        status: 'PAID',
                        paidDate: new Date(),
                        paidAmount: Number(recebivel.netAmount),
                        notes: conta.notes
                            ? `${conta.notes}\nBaixado via conciliação de extrato`
                            : 'Baixado via conciliação de extrato',
                        updatedAt: new Date()
                    }
                });
            }

            await tx.cardStatementLine.update({
                where: { id: linha.id },
                data: { status: 'APPLIED', notes: 'Aplicado via conciliação' }
            });

            baixados += 1;
            valorBaixado += Number(reg.netAmount);
        }

        const todas = await tx.cardStatementLine.findMany({
            where: { importId: id },
            select: { status: true }
        });
        const matched = todas.filter(l => l.status === 'MATCHED').length;

        await tx.cardStatementImport.update({
            where: { id },
            data: {
                status: 'APPLIED',
                appliedAt: new Date(),
                matchedLines: matched,
                unmatchedLines: todas.filter(l => l.status !== 'APPLIED' && l.status !== 'MATCHED').length,
                updatedAt: new Date()
            }
        });

        return { baixados, valorBaixado: Number(valorBaixado.toFixed(2)) };
    });

    return res.json({ ok: true, ...resultado });
});

// POST /api/conciliacao/importacoes/:id/cancelar
router.post('/importacoes/:id/cancelar', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'FINANCIAL'), async (req: any, res: any) => {
    const { id } = req.params;
    const importacao = await prisma.cardStatementImport.findUnique({ where: { id } });
    if (!importacao) {
        return res.status(404).json({ erro: "Importação não encontrada!" });
    }
    if (importacao.status === 'APPLIED') {
        return res.status(400).json({ erro: "Importação já aplicada! Não pode ser cancelada." });
    }

    await prisma.$transaction(async (tx) => {
        await tx.cardStatementLine.updateMany({
            where: { importId: id, status: { in: ['MATCHED', 'UNMATCHED'] } },
            data: { matchedReceivableId: null, status: 'UNMATCHED' }
        });
        await tx.cardStatementImport.update({
            where: { id },
            data: { status: 'CANCELLED', updatedAt: new Date() }
        });
    });

    return res.json({ ok: true, status: 'CANCELLED' });
});

export default router;
