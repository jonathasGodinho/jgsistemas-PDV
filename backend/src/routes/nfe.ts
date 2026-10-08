import { Router } from 'express';
import prisma from '../db';
import { cancelarNfce, emitirNfce } from '../nfe';
import { obterNfeConfig, urlQrCode } from '../nfe/config';
import { CERTIFICADO_KEY, inspecionarPfx, obterPfx } from '../nfe/cert';
import { requerPermissao } from '../middlewares/auth';
import { obterSetting, salvarSetting } from '../utils/settings';
import { cifrar, criptoDisponivel } from '../utils/cripto';
import { registrarAuditoria } from '../utils/auditoria';

const router = Router();

// POST /api/nfe/emitir/:id - Emite a NFC-e de uma venda COMPLETED
router.post('/emitir/:id', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    try {
        const resultado = await emitirNfce(req.params.id);
        if (!resultado.ok) return res.status(422).json(resultado);
        return res.json(resultado);
    } catch (e: any) {
        return res.status(500).json({ ok: false, erro: e.message });
    }
});

// POST /api/nfe/cancelar/:id - Cancela (evento 110111) uma NFC-e autorizada
router.post('/cancelar/:id', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    try {
        const resultado = await cancelarNfce(req.params.id, req.body?.justificativa ?? '');
        if (!resultado.ok) return res.status(422).json(resultado);
        return res.json(resultado);
    } catch (e: any) {
        return res.status(500).json({ ok: false, erro: e.message });
    }
});

const soDigitos = (v: any) => String(v ?? '').replace(/\D/g, '');

// GET /api/nfe/status - Situação da NFC-e: o que está pronto e o que falta (tela Fiscal)
router.get('/status', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (_req: any, res: any) => {
    try {
        const [empresa, cfg, salvo, semNcm] = await Promise.all([
            prisma.company.findFirst(),
            obterNfeConfig(),
            obterSetting<any>(CERTIFICADO_KEY, null),
            prisma.product.count({ where: { isActive: true, OR: [{ ncm: null }, { ncm: '' }] } })
        ]);
        let certificado: any = null;
        let erroCert: string | null = null;
        try {
            const a1 = await obterPfx();
            if (a1) {
                const info = inspecionarPfx(a1.pfx, a1.senha);
                const dias = Math.floor((new Date(info.validoAte).getTime() - Date.now()) / 86400000);
                certificado = { origem: a1.origem, titular: info.titular, cnpj: info.cnpj, validoAte: info.validoAte, diasRestantes: dias, enviadoEm: salvo?.enviadoEm ?? null };
            }
        } catch (e: any) { erroCert = e.message; }

        const cnpjEmpresa = soDigitos(empresa?.document);
        const pend: { item: string; ok: boolean; detalhe?: string }[] = [
            { item: 'CNPJ da empresa', ok: cnpjEmpresa.length === 14 && cnpjEmpresa !== '00000000000000', detalhe: 'Configurações › Empresa' },
            { item: 'Inscrição estadual', ok: soDigitos(empresa?.stateReg).length >= 8, detalhe: 'Somente números' },
            { item: 'Endereço completo da empresa', ok: !!(empresa?.address && empresa?.number && empresa?.neighborhood && empresa?.city && empresa?.zipCode) },
            { item: 'UF da empresa = AM', ok: String(empresa?.state ?? '').toUpperCase() === 'AM', detalhe: 'A emissão está configurada para a SEFAZ-AM' },
            { item: 'Código IBGE do município', ok: soDigitos(empresa?.cityCode).length === 7, detalhe: 'Preenchido ao buscar o CEP' },
            { item: 'Certificado digital A1', ok: !!certificado && certificado.diasRestantes >= 0, detalhe: erroCert ?? (certificado ? `Válido até ${new Date(certificado.validoAte).toLocaleDateString('pt-BR')}` : 'Envie o arquivo .pfx abaixo') },
            { item: 'Certificado do mesmo CNPJ da empresa', ok: !!certificado && (!certificado.cnpj || certificado.cnpj === cnpjEmpresa), detalhe: certificado?.cnpj ? `Certificado: ${certificado.cnpj}` : undefined },
            { item: 'CSC e ID do CSC', ok: !!(cfg.csc && cfg.cscId), detalhe: 'Solicite no portal da SEFAZ-AM (homologação e produção têm CSC diferentes)' },
            { item: 'Produtos ativos com NCM', ok: semNcm === 0, detalhe: semNcm ? `${semNcm} produto(s) sem NCM` : undefined }
        ];
        return res.json({
            uf: 'AM',
            habilitado: cfg.habilitado,
            tpAmb: cfg.tpAmb,
            ambiente: cfg.tpAmb === 2 ? 'Homologação' : 'Produção',
            serie: cfg.serie,
            proximoNumero: cfg.proximoNumero,
            urlQrCode: urlQrCode(cfg),
            simulacao: process.env.NFE_DRY_RUN === '1',
            criptoDisponivel: criptoDisponivel(),
            certificado,
            pendencias: pend,
            pronto: pend.every(p => p.ok)
        });
    } catch (e: any) {
        return res.status(500).json({ erro: e.message });
    }
});

// POST /api/nfe/certificado - Envia o certificado A1 (.pfx em base64 + senha). Só ADMIN.
// O arquivo e a senha ficam no banco criptografados (AES-256-GCM, chave só no servidor).
router.post('/certificado', requerPermissao('ADMIN'), async (req: any, res: any) => {
    try {
        if (!criptoDisponivel()) {
            return res.status(500).json({ erro: 'O servidor não tem a chave de criptografia configurada (JG_CHAVE_CRIPTO).' });
        }
        const b64 = String(req.body?.arquivo ?? '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
        const senha = String(req.body?.senha ?? '');
        if (!b64) return res.status(400).json({ erro: 'Selecione o arquivo do certificado (.pfx).' });
        const pfx = Buffer.from(b64, 'base64');
        if (pfx.length < 500 || pfx.length > 50_000) return res.status(400).json({ erro: 'Arquivo inválido: o certificado A1 tem entre 2 e 10 KB.' });
        let info;
        try { info = inspecionarPfx(pfx, senha); }
        catch (e: any) { return res.status(400).json({ erro: /mac|password|senha|Invalid/i.test(e.message) ? 'Senha do certificado incorreta.' : e.message }); }
        if (new Date(info.validoAte).getTime() < Date.now()) {
            return res.status(400).json({ erro: `Certificado vencido em ${new Date(info.validoAte).toLocaleDateString('pt-BR')}.` });
        }
        const enviadoEm = new Date().toISOString();
        await salvarSetting(CERTIFICADO_KEY, {
            pfx: cifrar(pfx),
            senha: cifrar(senha),
            titular: info.titular,
            cnpj: info.cnpj,
            validoAte: info.validoAte,
            enviadoEm
        });
        registrarAuditoria({
            userId: req.operador.id,
            action: 'CERTIFICADO_NFCE_ENVIADO',
            entity: 'COMPANY',
            entityId: null,
            detail: { titular: info.titular, cnpj: info.cnpj, validoAte: info.validoAte }
        });
        return res.json({ ok: true, titular: info.titular, cnpj: info.cnpj, validoAte: info.validoAte, enviadoEm });
    } catch (e: any) {
        return res.status(500).json({ erro: e.message });
    }
});

// DELETE /api/nfe/certificado - Remove o certificado guardado no banco. Só ADMIN.
router.delete('/certificado', requerPermissao('ADMIN'), async (req: any, res: any) => {
    await salvarSetting(CERTIFICADO_KEY, {});
    registrarAuditoria({ userId: req.operador.id, action: 'CERTIFICADO_NFCE_REMOVIDO', entity: 'COMPANY', entityId: null, detail: {} });
    return res.json({ ok: true });
});

export default router;
