import { Router } from 'express';
import prisma from '../db';
import { autenticar } from '../middlewares/auth';
import { CATALOGO, liberacaoAtual } from '../utils/modulos';
import { obterSetting } from '../utils/settings';

const router = Router();
router.use(autenticar);

// GET /api/sistema/modulos - Módulos liberados para esta instalação (usado pelo menu)
router.get('/modulos', async (_req: any, res: any) => {
    const lib = liberacaoAtual();
    const empresa = await prisma.company.findFirst({ select: { tradeName: true, name: true } }).catch(() => null);
    const segmento = lib.segmento || await obterSetting<string>('segmento', 'MODA');
    return res.json({
        liberados: lib.liberados, // null = todos
        plano: lib.plano ?? null,
        limites: lib.limites ?? null,
        segmento,
        empresa: empresa ? (empresa.tradeName || empresa.name) : null,
        catalogo: CATALOGO.map(m => ({
            chave: m.chave,
            nome: m.nome,
            grupo: m.grupo,
            descricao: m.descricao,
            icone: m.icone ?? null,
            futuro: !!m.futuro,
            ativo: lib.liberados === null ? !m.futuro : lib.liberados.includes(m.chave)
        }))
    });
});

// GET /api/sistema/cep/:cep - Endereço pelo CEP (ViaCEP, consultado pelo servidor
// porque o CSP do navegador só permite chamadas à própria origem)
const cacheCep = new Map<string, any>();
router.get('/cep/:cep', async (req: any, res: any) => {
    const cep = String(req.params.cep || '').replace(/\D/g, '');
    if (cep.length !== 8) return res.status(400).json({ erro: 'CEP inválido! Informe 8 dígitos.' });
    if (cacheCep.has(cep)) return res.json(cacheCep.get(cep));
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: ctrl.signal });
        clearTimeout(t);
        const d: any = await r.json();
        if (!r.ok || d.erro) return res.status(404).json({ erro: 'CEP não encontrado.' });
        const endereco = {
            cep: d.cep,
            endereco: d.logradouro || '',
            complemento: d.complemento || '',
            bairro: d.bairro || '',
            cidade: d.localidade || '',
            estado: d.uf || '',
            ibge: d.ibge || ''
        };
        if (cacheCep.size > 2000) cacheCep.clear();
        cacheCep.set(cep, endereco);
        return res.json(endereco);
    } catch (e: any) {
        console.error('Falha ao consultar CEP:', e?.name, e?.message, e?.cause?.code ?? '');
        return res.status(502).json({ erro: 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.' });
    }
});

export default router;
