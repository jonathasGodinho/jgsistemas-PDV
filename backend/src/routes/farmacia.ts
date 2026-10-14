import { Router } from 'express';
import prisma from '../db';
import { contextoAtual } from '../tenant';
import { moduloAtivo } from '../utils/modulos';
import { obterSetting, salvarSetting } from '../utils/settings';
import { requerPermissao } from '../middlewares/auth';
import { formatarValidade } from '../utils/fefo';
import { importarCmed } from '../utils/cmed';

// Rotas do módulo farmacia. O gating é feito pelo contrato da empresa
// (`moduloAtivo`); as rotas deste router NÃO entram no catálogo de `apis` do
// módulo, para que o status continue respondendo (informando `ativo: false`)
// quando o módulo está desligado.
const router = Router();

// Limiar de vencimento em dias (D-07): configurável por admin (D-14).
const CHAVE_LIMIAR = 'farmacia_vencimento_dias';
const LIMIAR_PADRAO = 90;
const LIMIAR_MAXIMO = 3650;

const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Dias de calendário entre hoje e a validade (negativo quando já venceu).
const diasRestantes = (validade: Date, hoje: Date) =>
    Math.round((inicioDoDia(new Date(validade)).getTime() - inicioDoDia(hoje).getTime()) / 86_400_000);

async function limiarVigente(): Promise<number> {
    const bruto = Number(await obterSetting<number>(CHAVE_LIMIAR, LIMIAR_PADRAO));
    if (!Number.isFinite(bruto) || bruto < 0) return LIMIAR_PADRAO;
    return Math.min(Math.floor(bruto), LIMIAR_MAXIMO);
}

// D-17: o alerta inclui os lotes já vencidos e os que vencem dentro do limiar.
async function alertaVencimento() {
    const limiarDias = await limiarVigente();
    const hoje = inicioDoDia(new Date());
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() + limiarDias);

    const lotes = await prisma.lote.findMany({
        where: { quantidade: { gt: 0 }, validade: { lte: limite } },
        orderBy: [{ validade: 'asc' }, { lote: 'asc' }],
        include: { Product: true, Branch: true }
    });

    return {
        limiarDias,
        hoje: formatarValidade(hoje),
        lotes: lotes.map((l) => {
            const dias = diasRestantes(l.validade, hoje);
            return {
                id: l.id,
                lote: l.lote,
                validade: formatarValidade(l.validade),
                quantidade: Number(l.quantidade),
                diasRestantes: dias,
                vencido: dias < 0,
                produtoId: l.productId,
                produtoNome: l.Product?.name ?? null,
                registroMS: l.Product?.registroMS ?? null,
                filialId: l.branchId,
                filialNome: l.Branch?.name ?? null
            };
        })
    };
}

router.get('/status', (_req, res) => {
    res.json({ modulo: 'farmacia', ativo: moduloAtivo('farmacia') });
});

// GET /api/farmacia/vencimento - limiar vigente do alerta (dias)
router.get('/vencimento', async (_req, res) => {
    try {
        res.json({ limiarDias: await limiarVigente() });
    } catch (error: any) {
        res.status(400).json({ erro: error.message });
    }
});

// PUT /api/farmacia/vencimento - grava o limiar (restrito ao admin, D-14)
router.put('/vencimento', requerPermissao('ADMIN'), async (req: any, res: any) => {
    try {
        const dias = Number(req.body?.dias);
        if (!Number.isInteger(dias) || dias < 0 || dias > LIMIAR_MAXIMO) {
            return res.status(400).json({ erro: `Informe o limiar em dias (0 a ${LIMIAR_MAXIMO}).` });
        }
        await salvarSetting(CHAVE_LIMIAR, dias);
        return res.json({ limiarDias: dias });
    } catch (error: any) {
        return res.status(400).json({ erro: error.message });
    }
});

// GET /api/farmacia/vencendo - lotes já vencidos e a vencer dentro do limiar
router.get('/vencendo', async (_req, res) => {
    try {
        res.json(await alertaVencimento());
    } catch (error: any) {
        res.status(400).json({ erro: error.message });
    }
});

// GET /api/farmacia/vencendo - lotes já vencidos e a vencer dentro do limiar
router.get('/vencendo', async (_req, res) => {
    try {
        res.json(await alertaVencimento());
    } catch (error: any) {
        res.status(400).json({ erro: error.message });
    }
});

// POST /api/farmacia/cmed - importa a planilha de PMC da CMED (restrito ao admin).
// D-05: a importação substitui a tabela inteira da empresa.
router.post('/cmed', requerPermissao('ADMIN'), async (req: any, res: any) => {
    try {
        const csv = typeof req.body?.csv === 'string' ? req.body.csv : (typeof req.body === 'string' ? req.body : '');
        if (!csv.trim()) {
            return res.status(400).json({ erro: 'Envie o conteúdo CSV da planilha CMED.' });
        }

        const companyId = contextoAtual()?.companyId;
        if (!companyId) {
            return res.status(400).json({ erro: 'Empresa não identificada.' });
        }

        return res.json({ importados: await importarCmed(companyId, csv) });
    } catch (error: any) {
        return res.status(400).json({ erro: error.message });
    }
});

export default router;
