// Carrega o .env local (dev). Em produção na Vercel as variáveis já vêm do
// ambiente do projeto e não existe arquivo .env, então isto é inofensivo.
// Deve vir antes de qualquer import que leia process.env (ex.: ./db, ./utils/cripto).
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { autenticar } from './middlewares/auth';
import { headersSeguranca, bloquearBotsIA, protegerInjecao } from './middlewares/seguranca';
import { criarLimiter } from './middlewares/rateLimit';
import vendasRouter from './routes/vendas';
import pixRouter from './routes/pix';
import produtosRouter from './routes/produtos';
import categoriasRouter from './routes/categorias';
import clientesRouter from './routes/clientes';
import estoqueRouter from './routes/estoque';
import financeiroRouter from './routes/financeiro';
import fornecedoresRouter from './routes/fornecedores';
import funcionariosRouter from './routes/funcionarios';
import caixaRouter from './routes/caixa';
import configuracoesRouter from './routes/configuracoes';
import vendasForaPdvRouter from './routes/vendasForaPdv';
import authRouter from './routes/auth';
import dashboardRouter from './routes/dashboard';
import relatoriosRouter from './routes/relatorios';
import comprasRouter from './routes/compras';
import marcasRouter from './routes/marcas';
import colecoesRouter from './routes/colecoes';
import fidelidadeRouter from './routes/fidelidade';
import auditoriaRouter from './routes/auditoria';
import tabelasPrecoRouter from './routes/tabelas-preco';
import promocoesRouter from './routes/promocoes';
import trocasRouter from './routes/trocas';
import inventarioRouter from './routes/inventario';
import crediarioRouter from './routes/crediario';
import cartoesRouter from './routes/cartoes';
import conciliacaoRouter from './routes/conciliacao';
import nfeRouter from './routes/nfe';
import sistemaRouter from './routes/sistema';
import { exigirModulos } from './utils/modulos';

const app = express();
// CORS desativado de propósito: o frontend é servido pela própria API (mesma
// origem), então não há chamadas entre origens. A sessão usa cookie httpOnly e
// não pode ser usada de outra origem. Sem cabeçalhos CORS, o navegador bloqueia
// qualquer consumo cruzado de origem.
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Segurança: headers + limite de requisições (por IP). Em produção, atrás do Nginx,
// defina TRUST_PROXY=1 no .env para que req.ip capture o IP real do cliente.
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
app.use(headersSeguranca);

// Bloqueio de crawlers de IA/LLM e scrapers (defesa em profundidade).
app.use(bloquearBotsIA);

// robots.txt: sistema privado, desautoriza indexação.
app.get('/robots.txt', (_req: any, res: any) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

app.use('/api', protegerInjecao);
app.use('/api', criarLimiter({
    chave: 'api',
    janelaMs: 60_000,
    max: 300,
    mensagem: "Muitas requisições em pouco tempo. Aguarde um instante e tente novamente."
}));
app.use('/api/auth/login', criarLimiter({
    chave: 'login',
    janelaMs: 60_000,
    max: 10,
    mensagem: "Muitas tentativas de login. Aguarde um minuto e tente novamente."
}));

// Módulos liberados pelo Painel do Administrador: barra páginas e APIs dos bloqueados.
app.use(exigirModulos);

// Serve o front-end (PDV) pela própria API, na mesma origem
// Sem cache: garante que alterações de HTML/CSS/JS apareçam imediatamente no navegador
app.use(express.static(path.join(__dirname, '../../frontend'), {
    dotfiles: 'ignore',
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
}));

// Rotas da API
app.use('/api/auth', authRouter);
app.use('/api/pix', autenticar, pixRouter);
app.use('/api/produtos', autenticar, produtosRouter);
app.use('/api/categorias', autenticar, categoriasRouter);
app.use('/api/clientes', autenticar, clientesRouter);
app.use('/api/estoque', autenticar, estoqueRouter);
app.use('/api/financeiro', autenticar, financeiroRouter);
app.use('/api/fornecedores', autenticar, fornecedoresRouter);
app.use('/api/funcionarios', autenticar, funcionariosRouter);
app.use('/api/caixa', caixaRouter);
app.use('/api/configuracoes', autenticar, configuracoesRouter);
app.use('/api/vendas', vendasRouter);
app.use('/api/vendas-fora-pdv', vendasForaPdvRouter);
app.use('/api/dashboard', autenticar, dashboardRouter);
app.use('/api/relatorios', autenticar, relatoriosRouter);
app.use('/api/compras', autenticar, comprasRouter);
app.use('/api/marcas', autenticar, marcasRouter);
app.use('/api/colecoes', autenticar, colecoesRouter);
app.use('/api/fidelidade', fidelidadeRouter);
app.use('/api/auditoria', auditoriaRouter);
app.use('/api/tabelas-preco', autenticar, tabelasPrecoRouter);
app.use('/api/promocoes', autenticar, promocoesRouter);
app.use('/api/trocas', trocasRouter);
app.use('/api/inventario', inventarioRouter);
app.use('/api/crediario', crediarioRouter);
app.use('/api/cartoes', autenticar, cartoesRouter);
app.use('/api/conciliacao', autenticar, conciliacaoRouter);
app.use('/api/nfe', autenticar, nfeRouter);
app.use('/api/sistema', sistemaRouter);

// Na Vercel o app roda como função (api/index.ts): sem abrir porta.
if (!process.env.VERCEL) {
    const PORT = Number(process.env.PORT) || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Servidor do ERP rodando na porta ${PORT}`);
    });
}

export default app;
