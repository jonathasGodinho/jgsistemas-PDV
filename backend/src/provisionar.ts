// Script: cria a estrutura mínima de um cliente novo (Company + Branch + operadores)
// Uso (executado pelo painel com DATABASE_URL apontando para o banco do cliente):
//   DATABASE_URL=postgresql://... PORT=3001 EMPRESA_NOME="Loja Exemplo" \
//   EMPRESA_DOCUMENTO=00000000000000 ADMIN_EMAIL=admin@loja.com ADMIN_SENHA=... \
//   npx ts-node src/provisionar.ts
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const env = (chave: string, obrigatorio = true): string => {
    const valor = process.env[chave];
    if (obrigatorio && !valor) throw new Error(`Variável de ambiente ${chave} não informada!`);
    return (valor ?? '').trim();
};

async function main() {
    const nomeEmpresa = env('EMPRESA_NOME');
    const documento = env('EMPRESA_DOCUMENTO').replace(/\D/g, '') || '00000000000000';
    const adminEmail = env('ADMIN_EMAIL');
    const adminSenha = env('ADMIN_SENHA');
    const adminNome = env('ADMIN_NOME') || 'ADMINISTRADOR';

    const tradeName = env('EMPRESA_FANTASIA', false) || nomeEmpresa;

    // Empresa (upsert por documento — idempotente para reprovisionamento)
    let empresa = await prisma.company.findFirst({ where: { document: documento } });
    const empresaId = empresa?.id ?? randomUUID();

    empresa = await prisma.company.upsert({
        where: { id: empresaId },
        create: {
            id: empresaId,
            name: nomeEmpresa,
            tradeName,
            document: documento,
            crt: 1,
            createdAt: new Date(),
            updatedAt: new Date()
        },
        update: {
            name: nomeEmpresa,
            tradeName,
            updatedAt: new Date()
        }
    });

    // Filial (a primeira)
    const filial = await prisma.branch.findFirst({ where: { companyId: empresa.id } });
    const filialId = filial?.id ?? randomUUID();
    const branch = await prisma.branch.upsert({
        where: { id: filialId },
        create: {
            id: filialId,
            companyId: empresa.id,
            name: 'MATRIZ',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        },
        update: { updatedAt: new Date() }
    });

    // Admin
    const hash = await bcrypt.hash(adminSenha, 10);
    const emailNormalizado = adminEmail.toLowerCase();

    const admin = await prisma.user.upsert({
        where: { email: emailNormalizado },
        create: {
            id: randomUUID(),
            companyId: empresa.id,
            branchId: branch.id,
            name: adminNome,
            email: emailNormalizado,
            password: hash,
            role: 'ADMIN',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        },
        update: {
            companyId: empresa.id,
            branchId: branch.id,
            name: adminNome,
            password: hash,
            role: 'ADMIN',
            isActive: true,
            updatedAt: new Date()
        }
    });

    console.log(JSON.stringify({
        ok: true,
        empresa: { id: empresa.id, nome: empresa.name, tradeName: empresa.tradeName },
        filial: { id: branch.id, nome: branch.name },
        admin: { id: admin.id, email: admin.email, senha: adminSenha },
        url: `http://localhost:${process.env.PORT || 3000}`
    }, null, 2));
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
