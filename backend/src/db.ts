import { PrismaClient } from '@prisma/client';

// Banco remoto (Supabase): cada consulta tem a latência da rede, então as transações
// da venda/fechamento precisam de mais folga que os 5 s padrão do Prisma.
const prisma = new PrismaClient({
    transactionOptions: { maxWait: 10_000, timeout: 30_000 }
});

export default prisma;
