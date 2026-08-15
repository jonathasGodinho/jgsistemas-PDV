// Script: cria/atualiza operadores padrão com senha conhecida para testes
// Uso: npx ts-node src/operadores.ts (ou SENHA_PADRAO=<senha> npx ts-node src/operadores.ts)
import { PrismaClient } from '@prisma/client';
import { randomUUID, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function gerarSenhaForte(n = 16): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = randomBytes(n);
    let senha = '';
    for (let i = 0; i < n; i++) senha += chars[bytes[i] % chars.length];
    return senha;
}

// Sem env informada, gera senha forte aleatória (nunca uma padrão conhecida/fraca).
const SENHA_PADRAO = process.env.SENHA_PADRAO ?? gerarSenhaForte();

const operadores = [
    { nome: 'ADMIN', email: 'admin@teste.com', papel: 'ADMIN', caixa: null },
    { nome: 'CAIXA 01', email: 'caixa1@jg.com', papel: 'SELLER', caixa: 1 },
    { nome: 'CAIXA 02', email: 'caixa2@jg.com', papel: 'SELLER', caixa: 2 }
];

async function main() {
    const empresa = await prisma.company.findFirst();
    if (!empresa) {
        throw new Error('Empresa não configurada! Execute o seed principal antes.');
    }

    const hash = await bcrypt.hash(SENHA_PADRAO, 10);
    let criados = 0;
    let atualizados = 0;

    for (const op of operadores) {
        const existente = await prisma.user.findUnique({ where: { email: op.email } });
        if (existente) {
            await prisma.user.update({
                where: { id: existente.id },
                data: {
                    password: hash,
                    isActive: true,
                    caixaNumber: op.caixa,
                    updatedAt: new Date()
                }
            });
            atualizados++;
        } else {
            await prisma.user.create({
                data: {
                    id: randomUUID(),
                    companyId: empresa.id,
                    name: op.nome,
                    email: op.email,
                    password: hash,
                    role: op.papel as any,
                    caixaNumber: op.caixa,
                    isActive: true,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });
            criados++;
        }
        console.log(`✔ ${op.email} (${op.nome}) — senha: ${SENHA_PADRAO} — caixa: ${op.caixa ?? '—'}`);
    }

    console.log(`\n✅ Operadores prontos: ${criados} criados, ${atualizados} atualizados.`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
