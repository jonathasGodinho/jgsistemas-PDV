// One-off: marca mustChangePassword=true nos usuários cuja senha é a padrão conhecida ("123456").
// Uso: npx ts-node src/flag-senha-padrao.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SENHA_PADRAO = '123456';

async function main() {
    const usuarios = await prisma.user.findMany({ select: { id: true, email: true, password: true } });
    let marcados = 0;
    for (const u of usuarios) {
        const ehPadrao = await bcrypt.compare(SENHA_PADRAO, u.password);
        if (ehPadrao) {
            await prisma.user.update({
                where: { id: u.id },
                data: {
                    mustChangePassword: true,
                    passwordChangedAt: new Date(),
                    sessionToken: null,
                    sessionExpiresAt: null,
                    updatedAt: new Date()
                }
            });
            marcados += 1;
            console.log(`✔ ${u.email} — marcado para troca de senha`);
        }
    }
    console.log(`\n✅ ${marcados} usuário(s) com senha padrão marcados para troca obrigatória.`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
