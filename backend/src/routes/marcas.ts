import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';

const router = Router();

// GET /api/marcas - Lista marcas
router.get('/', async (_req: any, res: any) => {
    const marcas = await prisma.brand.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { Product: true } } }
    });
    return res.json(marcas.map(m => ({
        id: m.id,
        nome: m.name,
        ativo: m.isActive,
        produtos: m._count.Product
    })));
});

// POST /api/marcas - Cria marca
router.post('/', async (req: any, res: any) => {
    const { nome } = req.body;
    if (!nome || !String(nome).trim()) {
        return res.status(400).json({ erro: "Informe o nome da marca!" });
    }
    const empresa = await prisma.company.findFirst();
    if (!empresa) {
        return res.status(400).json({ erro: "Empresa não configurada!" });
    }
    const marca = await prisma.brand.create({
        data: {
            id: randomUUID(),
            companyId: empresa.id,
            name: String(nome).trim().toUpperCase(),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        }
    });
    return res.status(201).json({ id: marca.id, nome: marca.name });
});

// PUT /api/marcas/:id - Atualiza marca
router.put('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const { nome, ativo } = req.body;
    const existente = await prisma.brand.findUnique({ where: { id } });
    if (!existente) {
        return res.status(404).json({ erro: "Marca não encontrada!" });
    }
    const marca = await prisma.brand.update({
        where: { id },
        data: {
            name: nome !== undefined ? String(nome).trim().toUpperCase() : existente.name,
            isActive: ativo !== undefined ? Boolean(ativo) : existente.isActive,
            updatedAt: new Date()
        }
    });
    return res.json({ id: marca.id, nome: marca.name });
});

// DELETE /api/marcas/:id - Exclui marca (se não tiver produtos)
router.delete('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const count = await prisma.product.count({ where: { brandId: id } });
    if (count > 0) {
        return res.status(400).json({ erro: "Marca possui produtos vinculados!" });
    }
    await prisma.brand.delete({ where: { id } });
    return res.json({ ok: true });
});

export default router;
