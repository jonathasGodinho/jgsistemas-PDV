import prisma from '../db';

// Dados da empresa configurados no módulo Configurações (usados em PIX e comprovantes)
export async function dadosEmpresa() {
    const empresa = await prisma.company.findFirst();
    if (!empresa) {
        return { name: '', tradeName: '', document: '', city: '', state: '', phone: '', email: '' };
    }
    return {
        name: empresa.name,
        tradeName: empresa.tradeName || empresa.name,
        document: empresa.document || '',
        city: empresa.city || '',
        state: empresa.state || '',
        phone: empresa.phone || '',
        email: empresa.email || ''
    };
}
