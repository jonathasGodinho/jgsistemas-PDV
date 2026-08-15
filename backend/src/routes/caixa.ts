import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../db';
import { autenticar, requerPermissao, ehOperadorDeCaixa } from '../middlewares/auth';

const router = Router();
router.use(autenticar);

const NUM_CAIXAS = 10;

const serializar = (c: any, vendasCalculadas?: number) => {
    const vendas = vendasCalculadas !== undefined
        ? vendasCalculadas
        : Number(c.totalSales ?? 0);
    return {
        id: c.id,
        numero: c.number,
        abertura: Number(c.openingBalance),
        vendas,
        entradas: Number(c.totalPayments ?? 0),
        saidas: Number(c.totalWithdrawals ?? 0),
        previsao: Number((Number(c.openingBalance) + vendas + Number(c.totalPayments ?? 0) - Number(c.totalWithdrawals ?? 0)).toFixed(2)),
        fechamento: c.closingBalance !== null ? Number(c.closingBalance) : null,
        abertoEm: c.openedAt,
        fechadoEm: c.closedAt,
        operador: c.User?.name ?? null,
        status: c.status,
        observacoes: c.notes
    };
};

const calcularVendasAbertas = async (caixa: any) => {
    const vendas = await prisma.sale.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: caixa.openedAt } }
    });
    return Number(vendas.reduce((s, v) => s + Number(v.total), 0).toFixed(2));
};

// GET /api/caixa - Status dos caixas (abertos + histórico + registradoras disponíveis)
// Operador de caixa (SELLER) vê somente os registros do próprio caixa.
router.get('/', async (req: any, res: any) => {
    const soDoOperador = ehOperadorDeCaixa(req);
    const userId = req.operador.id;

    const registros = await prisma.cashRegister.findMany({
        where: soDoOperador ? { userId } : undefined,
        orderBy: { openedAt: 'desc' },
        take: 50,
        include: { User: true }
    });

    const abertos = registros.filter(r => r.status === 'OPEN');
    const numerosAbertos = abertos.map(a => a.number);

    let numeros: number[] = [];
    if (soDoOperador) {
        // Operador de caixa só pode abrir a própria registradora vinculada
        if (req.operador.caixaNumber && !numerosAbertos.includes(req.operador.caixaNumber)) {
            numeros = [req.operador.caixaNumber];
        }
    } else {
        for (let i = 1; i <= NUM_CAIXAS; i++) {
            if (!numerosAbertos.includes(i)) numeros.push(i);
        }
    }

    const historico: any[] = [];
    for (const r of registros) {
        const vendas = r.status === 'OPEN' ? await calcularVendasAbertas(r) : undefined;
        historico.push(serializar(r, vendas));
    }

    return res.json({
        aberto: abertos[0] ? historico[registros.indexOf(abertos[0])] : null,
        numeros,
        numerosAbertos,
        historico
    });
});

// GET /api/caixa/aberto - Caixa atualmente aberto (usado pelo PDV)
router.get('/aberto', async (req: any, res: any) => {
    const caixa = await prisma.cashRegister.findFirst({
        where: {
            status: 'OPEN',
            ...(ehOperadorDeCaixa(req) ? { userId: req.operador.id } : {})
        },
        orderBy: { openedAt: 'desc' },
        include: { User: true }
    });
    if (!caixa) return res.json(null);
    const vendas = await calcularVendasAbertas(caixa);
    return res.json(serializar(caixa, vendas));
});

// POST /api/caixa/abrir - Abre a registradora (fluxo Ecocentauro)
router.post('/abrir', async (req: any, res: any) => {
    let { numero, valorInicial, observacoes } = req.body;

    // Operador de caixa só pode abrir a registradora vinculada a ele
    if (ehOperadorDeCaixa(req)) {
        numero = req.operador.caixaNumber;
        if (!numero) {
            return res.status(400).json({ erro: "Este operador não possui registradora vinculada!" });
        }
    }

    const num = Math.round(Number(numero) || 0);

    if (!num || num < 1 || num > NUM_CAIXAS) {
        return res.status(400).json({ erro: `Informe o número da registradora (1 a ${NUM_CAIXAS})!` });
    }

    if (valorInicial === undefined || valorInicial === null || String(valorInicial).trim() === '') {
        return res.status(400).json({ erro: "Informe o valor do fundo de caixa para abertura!" });
    }
    const valorFundo = Number(valorInicial);
    if (isNaN(valorFundo) || valorFundo < 0) {
        return res.status(400).json({ erro: "Valor do fundo de caixa inválido!" });
    }

    const aberto = await prisma.cashRegister.findFirst({
        where: { status: 'OPEN', number: num }
    });
    if (aberto) {
        return res.status(400).json({ erro: `A registradora ${num} já está aberta!` });
    }

    const empresa = await prisma.company.findFirst();
    const filial = await prisma.branch.findFirst();
    const operador = await prisma.user.findFirst({ where: { id: req.operador.id, isActive: true } });
    if (!empresa || !filial || !operador) {
        return res.status(400).json({ erro: "Empresa, filial ou operador não configurados!" });
    }

    const caixa = await prisma.cashRegister.create({
        data: {
            id: randomUUID(),
            companyId: empresa.id,
            branchId: filial.id,
            userId: operador.id,
            number: num,
            openingBalance: valorFundo,
            status: 'OPEN',
            openedAt: new Date(),
            notes: observacoes || null
        }
    });

    return res.status(201).json({
        id: caixa.id,
        numero: caixa.number,
        operador: operador.name,
        abertura: Number(caixa.openingBalance),
        abertoEm: caixa.openedAt
    });
});

// POST /api/caixa/fechar - Fecha a registradora (valor existente + senha do usuário)
router.post('/fechar', async (req: any, res: any) => {
    const { numero, senha, valorExistente, observacoes } = req.body;
    const num = Math.round(Number(numero) || 0);

    const caixa = await prisma.cashRegister.findFirst({
        where: {
            status: 'OPEN',
            number: num,
            ...(ehOperadorDeCaixa(req) ? { userId: req.operador.id } : {})
        },
        include: { User: true }
    });
    if (!caixa) {
        return res.status(400).json({ erro: `Nenhuma registradora ${num} aberta para este operador!` });
    }

    if (!senha) {
        return res.status(400).json({ erro: "Informe a senha do usuário para fechar o caixa!" });
    }
    const senhaOk = await bcrypt.compare(String(senha), caixa.User.password);
    if (!senhaOk) {
        return res.status(400).json({ erro: "Senha inválida! Fechamento não autorizado." });
    }

    const vendas = await prisma.sale.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: caixa.openedAt } }
    });
    const totalVendas = Number(vendas.reduce((s, v) => s + Number(v.total), 0).toFixed(2));

    const previsao = Number(
        (Number(caixa.openingBalance) + totalVendas + Number(caixa.totalPayments ?? 0) - Number(caixa.totalWithdrawals ?? 0)).toFixed(2)
    );
    const valorInfo = Number(valorExistente);
    const fechamento = valorInfo >= 0 ? Number(valorInfo.toFixed(2)) : previsao;

    const atualizado = await prisma.cashRegister.update({
        where: { id: caixa.id },
        data: {
            totalSales: totalVendas,
            closingBalance: fechamento,
            status: 'CLOSED',
            closedAt: new Date(),
            notes: observacoes || caixa.notes
        }
    });

    return res.json({
        ok: true,
        numero: atualizado.number,
        previsao,
        fechamento,
        divergencia: Number((fechamento - previsao).toFixed(2)),
        totalVendas
    });
});

// GET /api/caixa/fechamentos?data=AAAA-MM-DD - Relatório de fechamento do dia (admin)
router.get('/fechamentos', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const dataStr = req.query.data as string;
    if (!dataStr) {
        return res.status(400).json({ erro: "Informe a data do relatório (AAAA-MM-DD)!" });
    }

    const inicio = new Date(`${dataStr}T00:00:00`);
    const fim = new Date(`${dataStr}T23:59:59.999`);

    if (isNaN(inicio.getTime())) {
        return res.status(400).json({ erro: "Data inválida! Use o formato AAAA-MM-DD." });
    }

    // Fechados no dia + abertos que começaram no dia (para o admin saber o que falta fechar)
    const registros = await prisma.cashRegister.findMany({
        where: {
            OR: [
                { closedAt: { gte: inicio, lte: fim } },
                { status: 'OPEN', openedAt: { gte: inicio, lte: fim } }
            ]
        },
        orderBy: [{ number: 'asc' }],
        include: { User: true, CashMovement: { orderBy: { createdAt: 'asc' } } }
    });

    const relatorio: any[] = [];
    let totalVendasDia = 0;
    let totalQtdDia = 0;
    let totalDivergencia = 0;
    let fechadosDia = 0;

    for (const r of registros) {
        const periodoFim = r.status === 'OPEN' ? new Date() : (r.closedAt ?? r.openedAt);
        const vendas = await prisma.sale.findMany({
            where: {
                status: 'COMPLETED',
                createdAt: { gte: r.openedAt, lte: periodoFim }
            },
            include: { SaleItem: true }
        });

        const totalVendas = Number(vendas.reduce((s, v) => s + Number(v.total), 0).toFixed(2));
        const quantidade = vendas.reduce((s, v) => s + v.SaleItem.reduce((si, it) => si + it.quantity, 0), 0);

        const sangrias = r.CashMovement.filter(m => m.type === 'SANGRIAS');
        const suprimentos = r.CashMovement.filter(m => m.type === 'SUPRIMENTOS');

        const totalSangrias = Number(sangrias.reduce((s, m) => s + Number(m.amount), 0).toFixed(2));
        const totalSuprimentos = Number(suprimentos.reduce((s, m) => s + Number(m.amount), 0).toFixed(2));

        const previsao = Number(
            (Number(r.openingBalance) + totalVendas + Number(r.totalPayments ?? 0) - Number(r.totalWithdrawals ?? 0)).toFixed(2)
        );
        const fechamento = r.closingBalance !== null ? Number(r.closingBalance) : null;
        const divergencia = fechamento !== null ? Number((fechamento - previsao).toFixed(2)) : null;

        relatorio.push({
            id: r.id,
            numero: r.number,
            operador: r.User?.name ?? null,
            status: r.status,
            abertoEm: r.openedAt,
            fechadoEm: r.closedAt,
            abertura: Number(r.openingBalance),
            numVendas: vendas.length,
            quantidade,
            totalVendas,
            sangrias: sangrias.map(m => ({ id: m.id, tipo: 'SANGRIAS', valor: Number(m.amount), observacoes: m.notes, data: m.createdAt })),
            totalSangrias,
            suprimentos: suprimentos.map(m => ({ id: m.id, tipo: 'SUPRIMENTOS', valor: Number(m.amount), observacoes: m.notes, data: m.createdAt })),
            totalSuprimentos,
            previsao,
            fechamento,
            divergencia
        });

        totalVendasDia += totalVendas;
        totalQtdDia += quantidade;
        if (fechamento !== null) {
            fechadosDia++;
            totalDivergencia += divergencia ?? 0;
        }
    }

    return res.json({
        data: dataStr,
        totais: {
            caixasFechados: fechadosDia,
            caixasAbertos: registros.filter(r => r.status === 'OPEN').length,
            totalVendas: Number(totalVendasDia.toFixed(2)),
            totalQuantidade: totalQtdDia,
            divergencia: Number(totalDivergencia.toFixed(2))
        },
        registros: relatorio
    });
});

// POST /api/caixa/sangria - Saída de dinheiro do caixa aberto
router.post('/sangria', async (req: any, res: any) => {
    const { numero, valor, observacoes } = req.body;
    const num = Math.round(Number(numero) || 0);
    const caixa = await prisma.cashRegister.findFirst({
        where: {
            status: 'OPEN',
            number: num,
            ...(ehOperadorDeCaixa(req) ? { userId: req.operador.id } : {})
        }
    });
    if (!caixa) {
        return res.status(400).json({ erro: `Nenhuma registradora ${num} aberta para este operador!` });
    }
    const valorNum = Number(valor);
    if (!valorNum || valorNum <= 0) {
        return res.status(400).json({ erro: "Informe um valor válido!" });
    }

    const atual = await prisma.$transaction(async (tx) => {
        const reg = await tx.cashRegister.findFirst({
            where: {
                status: 'OPEN',
                number: num,
                ...(ehOperadorDeCaixa(req) ? { userId: req.operador.id } : {})
            }
        });
        if (!reg) throw new Error(`Nenhuma registradora ${num} aberta para este operador!`);
        const novo = Number(reg.totalWithdrawals ?? 0) + valorNum;
        await tx.cashRegister.update({
            where: { id: reg.id },
            data: { totalWithdrawals: novo, notes: observacoes || reg.notes }
        });
        const movimento = await tx.cashMovement.create({
            data: {
                id: randomUUID(),
                cashRegisterId: reg.id,
                type: 'SANGRIAS',
                amount: valorNum,
                notes: observacoes || null,
                createdAt: new Date()
            }
        });
        return { novo, movimento };
    });

    return res.json({
        ok: true,
        saidas: atual.novo,
        movimento: {
            id: atual.movimento.id,
            numero: num,
            tipo: 'SANGRIAS',
            valor: Number(atual.movimento.amount),
            observacoes: atual.movimento.notes,
            data: atual.movimento.createdAt
        }
    });
});

// POST /api/caixa/suprimento - Entrada de dinheiro no caixa aberto
router.post('/suprimento', async (req: any, res: any) => {
    const { numero, valor, observacoes } = req.body;
    const num = Math.round(Number(numero) || 0);
    const caixa = await prisma.cashRegister.findFirst({
        where: {
            status: 'OPEN',
            number: num,
            ...(ehOperadorDeCaixa(req) ? { userId: req.operador.id } : {})
        }
    });
    if (!caixa) {
        return res.status(400).json({ erro: `Nenhuma registradora ${num} aberta para este operador!` });
    }
    const valorNum = Number(valor);
    if (!valorNum || valorNum <= 0) {
        return res.status(400).json({ erro: "Informe um valor válido!" });
    }

    const atual = await prisma.$transaction(async (tx) => {
        const reg = await tx.cashRegister.findFirst({
            where: {
                status: 'OPEN',
                number: num,
                ...(ehOperadorDeCaixa(req) ? { userId: req.operador.id } : {})
            }
        });
        if (!reg) throw new Error(`Nenhuma registradora ${num} aberta para este operador!`);
        const novo = Number(reg.totalPayments ?? 0) + valorNum;
        await tx.cashRegister.update({
            where: { id: reg.id },
            data: { totalPayments: novo, notes: observacoes || reg.notes }
        });
        const movimento = await tx.cashMovement.create({
            data: {
                id: randomUUID(),
                cashRegisterId: reg.id,
                type: 'SUPRIMENTOS',
                amount: valorNum,
                notes: observacoes || null,
                createdAt: new Date()
            }
        });
        return { novo, movimento };
    });

    return res.json({
        ok: true,
        entradas: atual.novo,
        movimento: {
            id: atual.movimento.id,
            numero: num,
            tipo: 'SUPRIMENTOS',
            valor: Number(atual.movimento.amount),
            observacoes: atual.movimento.notes,
            data: atual.movimento.createdAt
        }
    });
});

export default router;
