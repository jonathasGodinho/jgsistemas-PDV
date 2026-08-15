import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { validarSenhaAdmin } from '../utils/autorizacao';
import { calcularAnaliseCredito } from '../utils/credito';
import { registrarAuditoria } from '../utils/auditoria';

const router = Router();

// GET /api/clientes - Lista clientes (busca opcional por nome, documento ou telefone)
router.get('/', async (req: any, res: any) => {
    const { busca } = req.query;

    const where = busca
        ? {
            OR: [
                { name: { contains: String(busca), mode: 'insensitive' as const } },
                { document: { contains: String(busca) } },
                { phone: { contains: String(busca) } },
                { cellphone: { contains: String(busca) } }
            ]
        }
        : {};

    const clientes = await prisma.customer.findMany({
        where,
        include: { _count: { select: { Sale: true } }, CashbackBalance: true },
        orderBy: { name: 'asc' }
    });

    return res.json(clientes.map(c => ({
        id: c.id,
        nome: c.name,
        documento: c.document,
        email: c.email,
        telefone: c.phone,
        celular: c.cellphone,
        nascimento: c.birthDate,
        endereco: c.address,
        numero: c.number,
        complemento: c.complement,
        bairro: c.neighborhood,
        cidade: c.city,
        estado: c.state,
        cep: c.zipCode,
        limite: Number(c.creditLimit),
        cashback: Number(c.CashbackBalance?.balance ?? 0),
        observacoes: c.notes,
        ativo: c.isActive,
        priceTableId: c.priceTableId,
        vendas: c._count.Sale
    })));
});

// POST /api/clientes - Cria um novo cliente
router.post('/', async (req: any, res: any) => {
    const { nome, documento, email, telefone, celular, nascimento, endereco, numero, complemento, bairro, cidade, estado, cep, limite, observacoes, priceTableId } = req.body;

    if (!nome || nome.trim() === '') {
        return res.status(400).json({ erro: "Informe o nome do cliente!" });
    }

    const empresa = await prisma.company.findFirst();
    if (!empresa) {
        return res.status(400).json({ erro: "Empresa não configurada!" });
    }

    if (documento && await prisma.customer.findFirst({ where: { document: documento } })) {
        return res.status(400).json({ erro: "Já existe cliente com este documento!" });
    }

    const cliente = await prisma.customer.create({
        data: {
            id: randomUUID(),
            companyId: empresa.id,
            name: nome.trim().toUpperCase(),
            document: documento || null,
            email: email || null,
            phone: telefone || null,
            cellphone: celular || null,
            birthDate: nascimento ? new Date(nascimento) : null,
            address: endereco || null,
            number: numero || null,
            complement: complemento || null,
            neighborhood: bairro || null,
            city: cidade || null,
            state: estado || null,
            zipCode: cep || null,
            creditLimit: Number(limite) || 0,
            notes: observacoes || null,
            priceTableId: priceTableId || null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        }
    });

    return res.status(201).json({ id: cliente.id, nome: cliente.name });
});

// PUT /api/clientes/:id - Atualiza um cliente
router.put('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const { nome, documento, email, telefone, celular, nascimento, endereco, numero, complemento, bairro, cidade, estado, cep, limite, observacoes, ativo, priceTableId } = req.body;

    const clienteExistente = await prisma.customer.findUnique({ where: { id } });
    if (!clienteExistente) {
        return res.status(404).json({ erro: "Cliente não encontrado!" });
    }

    if (documento && documento !== clienteExistente.document) {
        const dup = await prisma.customer.findFirst({ where: { document: documento } });
        if (dup) {
            return res.status(400).json({ erro: "Já existe cliente com este documento!" });
        }
    }

    const atualizado = await prisma.customer.update({
        where: { id },
        data: {
            name: nome !== undefined ? nome.trim().toUpperCase() : clienteExistente.name,
            document: documento !== undefined ? (documento || null) : clienteExistente.document,
            email: email !== undefined ? (email || null) : clienteExistente.email,
            phone: telefone !== undefined ? (telefone || null) : clienteExistente.phone,
            cellphone: celular !== undefined ? (celular || null) : clienteExistente.cellphone,
            birthDate: nascimento !== undefined ? (nascimento ? new Date(nascimento) : null) : clienteExistente.birthDate,
            address: endereco !== undefined ? (endereco || null) : clienteExistente.address,
            number: numero !== undefined ? (numero || null) : clienteExistente.number,
            complement: complemento !== undefined ? (complemento || null) : clienteExistente.complement,
            neighborhood: bairro !== undefined ? (bairro || null) : clienteExistente.neighborhood,
            city: cidade !== undefined ? (cidade || null) : clienteExistente.city,
            state: estado !== undefined ? (estado || null) : clienteExistente.state,
            zipCode: cep !== undefined ? (cep || null) : clienteExistente.zipCode,
            creditLimit: limite !== undefined ? Number(limite) : clienteExistente.creditLimit,
            notes: observacoes !== undefined ? (observacoes || null) : clienteExistente.notes,
            priceTableId: priceTableId !== undefined ? (priceTableId || null) : clienteExistente.priceTableId,
            isActive: ativo !== undefined ? Boolean(ativo) : clienteExistente.isActive,
            updatedAt: new Date()
        }
    });

    return res.json({ id: atualizado.id, nome: atualizado.name });
});

// GET /api/clientes/:id/situacao - Limite de crédito, valor em aberto e saldo de cashback
router.get('/:id/situacao', async (req: any, res: any) => {
    const { id } = req.params;

    const cliente = await prisma.customer.findUnique({
        where: { id },
        include: { CashbackBalance: true }
    });
    if (!cliente) {
        return res.status(404).json({ erro: "Cliente não encontrado!" });
    }

    const emAberto = await prisma.saleInstallment.aggregate({
        where: {
            Sale: { customerId: id },
            status: { in: ['PENDING', 'OVERDUE'] }
        },
        _sum: { amount: true }
    });

    return res.json({
        id: cliente.id,
        nome: cliente.name,
        limite: Number(cliente.creditLimit),
        emAberto: Number(emAberto._sum.amount ?? 0),
        cashback: Number(cliente.CashbackBalance?.balance ?? 0)
    });
});

// GET /api/clientes/:id/analise-credito - Score e limite sugerido de crédito
router.get('/:id/analise-credito', async (req: any, res: any) => {
    const { id } = req.params;

    const cliente = await prisma.customer.findUnique({
        where: { id },
        include: { CreditScore: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });
    if (!cliente) {
        return res.status(404).json({ erro: "Cliente não encontrado!" });
    }

    const analise = await calcularAnaliseCredito(id);

    return res.json({
        cliente: cliente.name,
        limiteAtual: Number(cliente.creditLimit),
        ultimaAnalise: cliente.CreditScore[0]
            ? {
                score: cliente.CreditScore[0].score,
                limite: Number(cliente.CreditScore[0].limit),
                data: cliente.CreditScore[0].createdAt
            }
            : null,
        ...analise
    });
});

// POST /api/clientes/:id/analise-credito/aplicar - Aplica o limite sugerido (exige senha admin)
router.post('/:id/analise-credito/aplicar', async (req: any, res: any) => {
    const { id } = req.params;
    const { senhaAdmin } = req.body;

    const cliente = await prisma.customer.findUnique({ where: { id } });
    if (!cliente) {
        return res.status(404).json({ erro: "Cliente não encontrado!" });
    }

    if (!(await validarSenhaAdmin(senhaAdmin ?? ''))) {
        return res.status(401).json({ erro: "Senha de administrador incorreta!" });
    }

    const analise = await calcularAnaliseCredito(id);

    await prisma.$transaction(async (tx) => {
        await tx.customer.update({
            where: { id },
            data: { creditLimit: analise.limiteSugerido, updatedAt: new Date() }
        });
        await tx.creditScore.create({
            data: {
                id: randomUUID(),
                customerId: id,
                score: analise.score,
                limit: analise.limiteSugerido,
                createdAt: new Date()
            }
        });
    });

    registrarAuditoria({
        userId: req.operador.id,
        action: 'LIMITE_CREDITO_ATUALIZADO',
        entity: 'CUSTOMER',
        entityId: id,
        detail: { nome: cliente.name, score: analise.score, limite: analise.limiteSugerido }
    });

    return res.json({ ok: true, limite: analise.limiteSugerido, score: analise.score });
});

// DELETE /api/clientes/:id - Exclui cliente (bloqueado se tiver vendas)
router.delete('/:id', async (req: any, res: any) => {
    const { id } = req.params;

    const vendas = await prisma.sale.count({ where: { customerId: id } });
    if (vendas > 0) {
        return res.status(400).json({ erro: "Não é possível excluir: cliente possui vendas registradas!" });
    }

    await prisma.customer.delete({ where: { id } });
    return res.json({ ok: true });
});

export default router;
