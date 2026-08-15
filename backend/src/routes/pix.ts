import { Router } from 'express';
import { gerarPixQrCode } from '../utils/pix';
import { dadosEmpresa } from '../utils/empresa';

const router = Router();

// POST /api/pix/qrcode - Gera o QR Code PIX para o valor informado
router.post('/qrcode', async (req: any, res: any) => {
    const { valor, txid } = req.body;

    const valorNum = Number(valor);
    if (!valorNum || valorNum <= 0) {
        return res.status(400).json({ erro: "Valor inválido para PIX!" });
    }

    try {
        const empresa = await dadosEmpresa();
        const chave = (empresa.document || '').replace(/\D/g, '').slice(0, 14) || '00000000000000';
        const { payload, qrDataUrl } = await gerarPixQrCode({
            chave,
            nome: empresa.tradeName,
            cidade: empresa.city || 'SAO PAULO',
            valor: valorNum,
            txid: txid ?? `JG${Date.now()}`
        });

        return res.json({ chave, payload, qrDataUrl });
    } catch (error: any) {
        return res.status(500).json({ erro: "Falha ao gerar QR Code: " + error.message });
    }
});

export default router;
