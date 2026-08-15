import bcrypt from 'bcryptjs';
import prisma from '../db';
import { obterSetting } from './settings';

export const validarSenhaAdmin = async (senha: string): Promise<boolean> => {
    if (!senha) return false;
    const admin = await prisma.user.findFirst({
        where: { isActive: true, role: 'ADMIN' },
        orderBy: { createdAt: 'asc' }
    });
    if (!admin) return false;
    return bcrypt.compare(String(senha), admin.password);
};

// Se o desconto ultrapassar o limite configurado, exige senha do administrador
export const descontoExigeSenha = async (desconto: number): Promise<boolean> => {
    const limite = Number(await obterSetting<number>('desconto_limite_sem_senha', 0)) || 0;
    return desconto > limite;
};

export const autorizarDesconto = async (desconto: number, senhaAdmin?: string): Promise<string | null> => {
    if (desconto <= 0) return null;
    if (!(await descontoExigeSenha(desconto))) return null;
    if (!(await validarSenhaAdmin(senhaAdmin ?? ''))) {
        return 'Desconto acima do limite exige a senha do administrador!';
    }
    return null;
};
