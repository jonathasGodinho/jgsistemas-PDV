import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';

const router = Router();

// GET /api/fornecedores - Lista fornecedores (com busca e contadores)
router.get('/', async (req: any, res: any) => {
    const { busca } = req.query;

    const where = busca
        ? {
            OR: [
                { name: { contains: String(busca), mode: 'insensitive' as const } },
                { document: { contains: String(busca) } },
                { contact: { contains: String(busca), mode: 'insensitive' as const } },
                { city: { contains: String(busca), mode: 'insensitive' as const } }
            ]
        }
        : {};

    const fornecedores = await prisma.supplier.findMany({
        where,
        include: {
            _count: { select: { Product: true, Purchase: true } }
        },
        orderBy: { name: 'asc' }
    });

    return res.json(fornecedores.map(f => ({
        id: f.id,
        nome: f.name,
        documento: f.document,
        email: f.email,
        telefone: f.phone,
        celular: f.cellphone,
        contato: f.contact,
        endereco: f.address,
        numero: f.number,
        complemento: f.complement,
        bairro: f.neighborhood,
        cidade: f.city,
        estado: f.state,
        cep: f.zipCode,
        observacoes: f.notes,
        ativo: f.isActive,
        produtos: f._count.Product,
        compras: f._count.Purchase
    })));
});

// POST /api/fornecedores - Cria um novo fornecedor
router.post('/', async (req: any, res: any) => {
    const { nome, documento, email, telefone, celular, contato, endereco, numero, complemento, bairro, cidade, estado, cep, observacoes, ativo } = req.body;

    if (!nome || nome.trim() === '') {
        return res.status(400).json({ erro: "Informe o nome do fornecedor!" });
    }

    if (documento) {
        const dup = await prisma.supplier.findFirst({ where: { document: documento } });
        if (dup) {
            return res.status(400).json({ erro: "Documento já cadastrado!" });
        }
    }

    const empresa = await prisma.company.findFirst();
    if (!empresa) {
        return res.status(400).json({ erro: "Empresa não configurada!" });
    }

    const fornecedor = await prisma.supplier.create({
        data: {
            id: randomUUID(),
            companyId: empresa.id,
            name: nome.trim().toUpperCase(),
            document: documento || null,
            email: email || null,
            phone: telefone || null,
            cellphone: celular || null,
            contact: contato || null,
            address: endereco || null,
            number: numero || null,
            complement: complemento || null,
            neighborhood: bairro || null,
            city: cidade || null,
            state: estado || null,
            zipCode: cep || null,
            notes: observacoes || null,
            isActive: ativo !== undefined ? Boolean(ativo) : true,
            createdAt: new Date(),
            updatedAt: new Date()
        }
    });

    return res.status(201).json({ id: fornecedor.id, nome: fornecedor.name });
});

// PUT /api/fornecedores/:id - Atualiza um fornecedor
router.put('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const { nome, documento, email, telefone, celular, contato, endereco, numero, complemento, bairro, cidade, estado, cep, observacoes, ativo } = req.body;

    const existente = await prisma.supplier.findUnique({ where: { id } });
    if (!existente) {
        return res.status(404).json({ erro: "Fornecedor não encontrado!" });
    }

    if (documento && documento !== existente.document) {
        const dup = await prisma.supplier.findFirst({ where: { document: documento } });
        if (dup) {
            return res.status(400).json({ erro: "Documento já cadastrado!" });
        }
    }

    const fornecedor = await prisma.supplier.update({
        where: { id },
        data: {
            name: nome !== undefined ? nome.trim().toUpperCase() : existente.name,
            document: documento !== undefined ? (documento || null) : existente.document,
            email: email !== undefined ? (email || null) : existente.email,
            phone: telefone !== undefined ? (telefone || null) : existente.phone,
            cellphone: celular !== undefined ? (celular || null) : existente.cellphone,
            contact: contato !== undefined ? (contato || null) : existente.contact,
            address: endereco !== undefined ? (endereco || null) : existente.address,
            number: numero !== undefined ? (numero || null) : existente.number,
            complement: complemento !== undefined ? (complemento || null) : existente.complement,
            neighborhood: bairro !== undefined ? (bairro || null) : existente.neighborhood,
            city: cidade !== undefined ? (cidade || null) : existente.city,
            state: estado !== undefined ? (estado || null) : existente.state,
            zipCode: cep !== undefined ? (cep || null) : existente.zipCode,
            notes: observacoes !== undefined ? (observacoes || null) : existente.notes,
            isActive: ativo !== undefined ? Boolean(ativo) : existente.isActive,
            updatedAt: new Date()
        }
    });

    return res.json({ id: fornecedor.id, nome: fornecedor.name });
});

// DELETE /api/fornecedores/:id - Exclui fornecedor (com proteção)
router.delete('/:id', async (req: any, res: any) => {
    const { id } = req.params;

    const fornecedor = await prisma.supplier.findUnique({
        where: { id },
        include: { _count: { select: { Product: true, Purchase: true, FinancialTransaction: true } } }
    });
    if (!fornecedor) {
        return res.status(404).json({ erro: "Fornecedor não encontrado!" });
    }

    if (fornecedor._count.Product > 0 || fornecedor._count.Purchase > 0 || fornecedor._count.FinancialTransaction > 0) {
        return res.status(400).json({ erro: "Não é possível excluir: fornecedor possui produtos, compras ou contas vinculadas!" });
    }

    await prisma.supplier.delete({ where: { id } });
    return res.json({ ok: true });
});

export default router;
