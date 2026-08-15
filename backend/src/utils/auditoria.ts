import { randomUUID } from 'crypto';
import prisma from '../db';

export const registrarAuditoria = async (dados: {
    userId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    detail?: any;
    ip?: string | null;
}) => {
    try {
        if (!dados.userId) return;
        await prisma.auditLog.create({
            data: {
                id: randomUUID(),
                userId: dados.userId,
                action: dados.action,
                entity: dados.entity,
                entityId: dados.entityId ?? null,
                detail: dados.detail ?? undefined,
                ip: dados.ip ?? null,
                createdAt: new Date()
            }
        });
    } catch (e) {
        console.error('Falha ao registrar auditoria:', e);
    }
};
