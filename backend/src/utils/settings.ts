import prisma from '../db';

export const obterSetting = async <T = string>(chave: string, padrao?: T): Promise<T> => {
    try {
        const s = await prisma.setting.findFirst({ where: { key: chave } });
        if (s && s.value !== null && s.value !== undefined) {
            return s.value as T;
        }
        return padrao as T;
    } catch (e) {
        return padrao as T;
    }
};

export const salvarSetting = async (chave: string, valor: any): Promise<void> => {
    const empresa = await prisma.company.findFirst();
    if (!empresa) return;

    const existente = await prisma.setting.findFirst({ where: { key: chave } });
    if (existente) {
        await prisma.setting.update({
            where: { id: existente.id },
            data: { value: valor, updatedAt: new Date() }
        });
    } else {
        await prisma.setting.create({
            data: {
                id: (await import('crypto')).randomUUID(),
                companyId: empresa.id,
                key: chave,
                value: valor,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });
    }
};
