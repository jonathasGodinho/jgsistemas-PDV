// One-off: rotaciona as senhas de todos os operadores para uma senha forte aleatória,
// invalida sessões ativas e força a troca no próximo login (trocarSenha=true).
// Uso: npx ts-node src/rotacionar-senhas.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

function gerarSenhaForte(n = 16): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = randomBytes(n);
    let senha = '';
    for (let i = 0; i < n; i++) senha += chars[bytes[i] % chars.length];
    return senha;
}

async function main() {
    const operadores = await prisma.user.findMany({ orderBy: { name: 'asc' } });
    if (operadores.length === 0) {
        console.log('Nenhum operador encontrado.');
        return;
    }
    for (const op of operadores) {
        const senha = gerarSenhaForte();
        await prisma.user.update({
            where: { id: op.id },
            data: {
                password: await bcrypt.hash(senha, 10),
                mustChangePassword: true,
                passwordChangedAt: new Date(),
                sessionToken: null,
                sessionExpiresAt: null,
                failedLoginCount: 0,
                lockedUntil: null,
                updatedAt: new Date()
            }
        });
        console.log(`${op.email} (${op.name}) — senha: ${senha}`);
    }
    console.log('\n✅ Senhas rotacionadas. Sessões ativas encerradas; troca obrigatória no próximo login.');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
