import { Router } from 'express';
import { cancelarNfce, emitirNfce } from '../nfe';

const router = Router();

// POST /api/nfe/emitir/:id - Emite a NFC-e de uma venda COMPLETED
router.post('/emitir/:id', async (req: any, res: any) => {
    try {
        const resultado = await emitirNfce(req.params.id);
        if (!resultado.ok) return res.status(422).json(resultado);
        return res.json(resultado);
    } catch (e: any) {
        return res.status(500).json({ ok: false, erro: e.message });
    }
});

// POST /api/nfe/cancelar/:id - Cancela (evento 110111) uma NFC-e autorizada
router.post('/cancelar/:id', async (req: any, res: any) => {
    try {
        const resultado = await cancelarNfce(req.params.id, req.body?.justificativa ?? '');
        if (!resultado.ok) return res.status(422).json(resultado);
        return res.json(resultado);
    } catch (e: any) {
        return res.status(500).json({ ok: false, erro: e.message });
    }
});

export default router;
