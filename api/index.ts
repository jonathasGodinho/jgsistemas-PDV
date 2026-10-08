// Função da Vercel: todas as rotas /api/* caem aqui e são tratadas pelo mesmo
// app Express do backend (backend/src/server.ts). As telas (frontend/) são
// servidas pela CDN da Vercel, no mesmo domínio, então o cookie de sessão funciona.
import app from '../backend/src/server';

export default app;
