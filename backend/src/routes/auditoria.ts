import { Router } from 'express';
import prisma from '../db';
import { autenticar, requerPermissao } from '../middlewares/auth';

const router = Router();
router.use(autenticar);
router.use(requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'));

// GET /api/auditoria - Histórico de operações sensíveis (com filtros)
router.get('/', async (req: any, res: any) => {
    const { de, ate, usuario, acao } = req.query;

    const and: any[] = [];
    if (de || ate) {
        const range: any = {};
        if (de) range.gte = new Date(`${de}T00:00:00`);
        if (ate) range.lte = new Date(`${ate}T23:59:59`);
        and.push({ createdAt: range });
    }
    if (usuario) {
        and.push({ User: { name: { contains: String(usuario), mode: 'insensitive' } } });
    }
    if (acao) {
        and.push({ action: { contains: String(acao), mode: 'insensitive' } });
    }

    const logs = await prisma.auditLog.findMany({
        where: and.length ? { AND: and } : {},
        orderBy: { createdAt: 'desc' },
        take: 500,
        include: { User: true }
    });

    return res.json(logs.map(l => ({
        id: l.id,
        operador: l.User.name,
        acao: l.action,
        entidade: l.entity,
        entidadeId: l.entityId,
        detalhe: l.detail,
        ip: l.ip,
        data: l.createdAt
    })));
});

export default router;
