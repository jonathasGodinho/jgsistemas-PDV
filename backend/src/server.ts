// Carrega o .env local (dev). Em produção na Vercel as variáveis já vêm do
// ambiente do projeto e não existe arquivo .env, então isto é inofensivo.
// Deve vir antes de qualquer import que leia process.env (ex.: ./db, ./utils/cripto).
import 'dotenv/config';
import app from './app';

// Na Vercel o app roda como função (api/index.ts): sem abrir porta.
if (!process.env.VERCEL) {
    const PORT = Number(process.env.PORT) || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Servidor do ERP rodando na porta ${PORT}`);
    });
}

export default app;
