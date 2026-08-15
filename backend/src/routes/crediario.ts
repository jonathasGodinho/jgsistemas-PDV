import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { autenticar } from '../middlewares/auth';
import { validarSenhaAdmin } from '../utils/autorizacao';
import { registrarAuditoria } from '../utils/auditoria';

const router = Router();
router.use(autenticar);

const somaMes = (data: Date, meses: number): Date => {
    const d = new Date(data);
    const dia = d.getDate();
    d.setMonth(d.getMonth() + meses, 1);
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(dia, ultimo));
    return d;
};

// POST /api/crediario/:id/renegociar - Cancela parcelas em aberto e gera novo cronograma
// Body: { novaPrimeiraData, parcelas, jurosPercent, senhaAdmin }
router.post('/:id/renegociar', async (req: any, res: any) => {
    const { id } = req.params;
    const { novaPrimeiraData, parcelas, jurosPercent, senhaAdmin } = req.body;

    const venda = await prisma.sale.findUnique({
        where: { id },
        include: {
            Customer: true,
            SaleInstallment: true,
            SalePayment: true
        }
    });
    if (!venda) {
        return res.status(404).json({ erro: "Venda não encontrada!" });
    }
    if (venda.SalePayment[0]?.method !== 'CREDIARIO') {
        return res.status(400).json({ erro: "Somente vendas no crediário podem ser renegociadas!" });
    }
    if (!(await validarSenhaAdmin(senhaAdmin ?? ''))) {
        return res.status(401).json({ erro: "Senha de administrador incorreta!" });
    }

    const primeiraData = new Date(`${novaPrimeiraData}T00:00:00`);
    if (isNaN(primeiraData.getTime())) {
        return res.status(400).json({ erro: "Informe a data da primeira parcela!" });
    }
    const qtdParcelas = Math.max(1, Math.min(24, Math.round(Number(parcelas) || 1)));
    const juros = Math.max(0, Number(jurosPercent) || 0);

    const aRenegociar = venda.SaleInstallment.filter(p => ['PENDING', 'OVERDUE'].includes(p.status));
    if (aRenegociar.length === 0) {
        return res.status(400).json({ erro: "Não há parcelas em aberto para renegociar!" });
    }

    const somaCents = aRenegociar.reduce((s, p) => s + Math.round(Number(p.amount) * 100), 0);
    const jurosCents = Math.round(somaCents * juros / 100);
    const totalCents = somaCents + jurosCents;
    const baseCents = Math.floor(totalCents / qtdParcelas);
    let restoCents = totalCents - baseCents * qtdParcelas;

    const result = await prisma.$transaction(async (tx) => {
        const empresa = await tx.company.findFirst();
        if (!empresa) {
            throw new Error("Empresa não configurada!");
        }

        // Cancela o saldo antigo
        await tx.saleInstallment.updateMany({
            where: { saleId: id, status: { in: ['PENDING', 'OVERDUE'] } },
            data: { status: 'CANCELLED' }
        });
        await tx.financialTransaction.updateMany({
            where: { saleId: id, status: { in: ['PENDING', 'OVERDUE'] } },
            data: { status: 'CANCELLED', updatedAt: new Date() }
        });

        // Gera novo cronograma
        for (let n = 1; n <= qtdParcelas; n++) {
            let valorCents = baseCents;
            if (restoCents > 0) { valorCents += 1; restoCents -= 1; }
            const valorParcela = Number((valorCents / 100).toFixed(2));
            const vencimento = somaMes(primeiraData, n - 1);

            await tx.saleInstallment.create({
                data: {
                    id: randomUUID(),
                    saleId: id,
                    number: n,
                    dueDate: vencimento,
                    amount: valorParcela,
                    status: vencimento < new Date() ? 'OVERDUE' : 'PENDING',
                    createdAt: new Date()
                }
            });

            await tx.financialTransaction.create({
                data: {
                    id: randomUUID(),
                    companyId: empresa.id,
                    type: 'RECEIVE',
                    status: vencimento < new Date() ? 'OVERDUE' : 'PENDING',
                    description: `RENEGOCIADO Nº ${venda.nfceNumber} - PARC ${n}/${qtdParcelas} - ${venda.Customer?.name?.toUpperCase() ?? 'CLIENTE'}`,
                    amount: valorParcela,
                    dueDate: vencimento,
                    category: 'CREDIARIO',
                    saleId: id,
                    notes: `Parcela ${n} de ${qtdParcelas}`,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });
        }

        const novaNota = `RENEGOCIAÇÃO em ${new Date().toLocaleDateString('pt-BR')}: ${aRenegociar.length} parcela(s) pendente(s) remanejada(s) para ${qtdParcelas}x${juros > 0 ? ` com juros de ${juros}%` : ''}`;
        await tx.sale.update({
            where: { id },
            data: {
                notes: venda.notes ? `${venda.notes}\n${novaNota}` : novaNota,
                updatedAt: new Date()
            }
        });

        return { totalCents };
    });

    registrarAuditoria({
        userId: req.operador.id,
        action: 'CREDIARIO_RENEGOCIADO',
        entity: 'SALE',
        entityId: venda.id,
        detail: {
            numero: venda.nfceNumber,
            parcelasAntigas: aRenegociar.length,
            novasParcelas: qtdParcelas,
            juros,
            novoTotal: Number((result.totalCents / 100).toFixed(2))
        }
    });

    return res.json({
        ok: true,
        parcelas: qtdParcelas,
        juros,
        novoTotal: Number((result.totalCents / 100).toFixed(2)),
        primeiraVencimento: primeiraData
    });
});

export default router;
