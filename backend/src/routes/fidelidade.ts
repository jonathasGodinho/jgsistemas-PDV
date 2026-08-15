import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { autenticar, requerPermissao } from '../middlewares/auth';
import { registrarAuditoria } from '../utils/auditoria';
import { validarSenhaAdmin } from '../utils/autorizacao';

const router = Router();
router.use(autenticar);

// GET /api/fidelidade - Clientes com saldo de cashback + extrato
router.get('/', async (req: any, res: any) => {
    const saldos = await prisma.cashbackBalance.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { Customer: true }
    });

    return res.json(saldos.map(s => ({
        clienteId: s.customerId,
        cliente: s.Customer.name,
        telefone: s.Customer.cellphone,
        saldo: Number(s.balance),
        atualizadoEm: s.updatedAt
    })));
});

// GET /api/fidelidade/:clienteId - Extrato de pontos do cliente
router.get('/:clienteId', async (req: any, res: any) => {
    const { clienteId } = req.params;

    const cliente = await prisma.customer.findUnique({
        where: { id: clienteId },
        include: {
            CashbackBalance: true,
            LoyaltyPoint: { orderBy: { createdAt: 'desc' }, take: 100 }
        }
    });

    if (!cliente) {
        return res.status(404).json({ erro: "Cliente não encontrado!" });
    }

    return res.json({
        clienteId: cliente.id,
        nome: cliente.name,
        saldo: Number(cliente.CashbackBalance?.balance ?? 0),
        movimentacoes: cliente.LoyaltyPoint.map(p => ({
            pontos: p.points,
            tipo: p.type,
            valor: Number((p.points / 100).toFixed(2)),
            data: p.createdAt
        }))
    });
});

// POST /api/fidelidade/ajuste - Ajusta o saldo de cashback de um cliente (adm/gerência)
router.post('/ajuste', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { clienteId, valor, motivo, senha } = req.body;
    const valorNum = Number(valor) || 0;
    if (!clienteId || valorNum === 0) {
        return res.status(400).json({ erro: "Informe o cliente e um valor diferente de zero!" });
    }
    if (!(await validarSenhaAdmin(senha ?? ''))) {
        return res.status(401).json({ erro: "Ajuste de cashback exige a senha do administrador!" });
    }

    const cliente = await prisma.customer.findUnique({ where: { id: clienteId } });
    if (!cliente) {
        return res.status(404).json({ erro: "Cliente não encontrado!" });
    }

    try {
        await prisma.$transaction(async (tx) => {
            const saldo = await tx.cashbackBalance.findUnique({ where: { customerId: clienteId } });
            const novoSaldo = Number(saldo?.balance ?? 0) + valorNum;
            if (novoSaldo < 0) {
                throw new Error("Saldo insuficiente para o ajuste!");
            }

            if (saldo) {
                await tx.cashbackBalance.update({
                    where: { id: saldo.id },
                    data: { balance: novoSaldo, updatedAt: new Date() }
                });
            } else {
                await tx.cashbackBalance.create({
                    data: {
                        id: randomUUID(),
                        customerId: clienteId,
                        balance: novoSaldo,
                        updatedAt: new Date()
                    }
                });
            }

            await tx.loyaltyPoint.create({
                data: {
                    id: randomUUID(),
                    customerId: clienteId,
                    points: Math.round(valorNum * 100),
                    type: valorNum > 0 ? 'CASHBACK_AJUSTE_CREDITO' : 'CASHBACK_AJUSTE_DEBITO',
                    createdAt: new Date()
                }
            });
        });
    } catch (e: any) {
        return res.status(400).json({ erro: e.message });
    }

    registrarAuditoria({
        userId: req.operador.id,
        action: 'CASHBACK_AJUSTADO',
        entity: 'CUSTOMER',
        entityId: clienteId,
        detail: { valor: valorNum, motivo }
    });

    const saldoAtual = await prisma.cashbackBalance.findUnique({ where: { customerId: clienteId } });
    return res.json({ ok: true, novoSaldo: Number((Number(saldoAtual?.balance ?? 0)).toFixed(2)) });
});

export default router;
