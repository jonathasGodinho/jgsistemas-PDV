import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { requerPermissao } from '../middlewares/auth';

const router = Router();

// GET /api/categorias - Lista todas as categorias
router.get('/', async (_req: any, res: any) => {
    const categorias = await prisma.category.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { Product: true } } }
    });

    return res.json(categorias.map(c => ({
        id: c.id,
        nome: c.name,
        ativo: c.isActive,
        produtos: c._count.Product
    })));
});

// POST /api/categorias - Cria uma nova categoria
router.post('/', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { nome } = req.body;

    if (!nome || nome.trim() === '') {
        return res.status(400).json({ erro: "Informe o nome da categoria!" });
    }

    const empresa = await prisma.company.findUnique({ where: { id: req.operador.companyId } });
    if (!empresa) {
        return res.status(400).json({ erro: "Empresa não configurada!" });
    }

    const nomeLimpo = nome.trim().toUpperCase();
    const existente = await prisma.category.findFirst({ where: { name: nomeLimpo } });
    if (existente) {
        return res.status(400).json({ erro: "Categoria já existe!" });
    }

    const categoria = await prisma.category.create({
        data: {
            id: randomUUID(),
            companyId: empresa.id,
            name: nomeLimpo,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        }
    });

    return res.status(201).json({ id: categoria.id, nome: categoria.name });
});

// PUT /api/categorias/:id - Renomeia categoria
router.put('/:id', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { id } = req.params;
    const { nome } = req.body;

    const categoria = await prisma.category.findUnique({ where: { id } });
    if (!categoria) {
        return res.status(404).json({ erro: "Categoria não encontrada!" });
    }

    if (!nome || nome.trim() === '') {
        return res.status(400).json({ erro: "Informe o nome da categoria!" });
    }

    const nomeLimpo = nome.trim().toUpperCase();
    const dup = await prisma.category.findFirst({
        where: { name: nomeLimpo, id: { not: id } }
    });
    if (dup) {
        return res.status(400).json({ erro: "Já existe categoria com esse nome!" });
    }

    const atualizada = await prisma.category.update({
        where: { id },
        data: { name: nomeLimpo, updatedAt: new Date() }
    });

    return res.json({ id: atualizada.id, nome: atualizada.name });
});

// DELETE /api/categorias/:id - Exclui categoria (produtos ficam sem categoria)
router.delete('/:id', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { id } = req.params;

    const categoria = await prisma.category.findUnique({ where: { id } });
    if (!categoria) {
        return res.status(404).json({ erro: "Categoria não encontrada!" });
    }

    await prisma.category.delete({ where: { id } });
    return res.json({ ok: true });
});

export default router;
