import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';

const router = Router();

// GET /api/colecoes - Lista coleções
router.get('/', async (_req: any, res: any) => {
    const colecoes = await prisma.collection.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { Product: true } } }
    });
    return res.json(colecoes.map(c => ({
        id: c.id,
        nome: c.name,
        temporada: c.season,
        ano: c.year,
        ativo: c.isActive,
        produtos: c._count.Product
    })));
});

// POST /api/colecoes - Cria coleção
router.post('/', async (req: any, res: any) => {
    const { nome, temporada, ano } = req.body;
    if (!nome || !String(nome).trim()) {
        return res.status(400).json({ erro: "Informe o nome da coleção!" });
    }
    const empresa = await prisma.company.findFirst();
    if (!empresa) {
        return res.status(400).json({ erro: "Empresa não configurada!" });
    }
    const colecao = await prisma.collection.create({
        data: {
            id: randomUUID(),
            companyId: empresa.id,
            name: String(nome).trim().toUpperCase(),
            season: temporada ? String(temporada).trim() : null,
            year: ano ? Number(ano) : null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        }
    });
    return res.status(201).json({ id: colecao.id, nome: colecao.name });
});

// PUT /api/colecoes/:id - Atualiza coleção
router.put('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const { nome, temporada, ano, ativo } = req.body;
    const existente = await prisma.collection.findUnique({ where: { id } });
    if (!existente) {
        return res.status(404).json({ erro: "Coleção não encontrada!" });
    }
    const colecao = await prisma.collection.update({
        where: { id },
        data: {
            name: nome !== undefined ? String(nome).trim().toUpperCase() : existente.name,
            season: temporada !== undefined ? (temporada ? String(temporada).trim() : null) : existente.season,
            year: ano !== undefined ? (ano ? Number(ano) : null) : existente.year,
            isActive: ativo !== undefined ? Boolean(ativo) : existente.isActive,
            updatedAt: new Date()
        }
    });
    return res.json({ id: colecao.id, nome: colecao.name });
});

// DELETE /api/colecoes/:id - Exclui coleção (se não tiver produtos)
router.delete('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const count = await prisma.product.count({ where: { collectionId: id } });
    if (count > 0) {
        return res.status(400).json({ erro: "Coleção possui produtos vinculados!" });
    }
    await prisma.collection.delete({ where: { id } });
    return res.json({ ok: true });
});

export default router;
