import { Router } from 'express';
import prisma from '../db';
import { obterSetting, salvarSetting } from '../utils/settings';
import { requerPermissao } from '../middlewares/auth';

// Perfis autorizados a ALTERAR a configuração da empresa (dados, segurança, NFC-e).
const PERFIS_PRIVILEGIADOS = ['ADMIN', 'MANAGER', 'SUPERVISOR'];

const router = Router();

const CAMPOS = [
    'name',
    'tradeName',
    'document',
    'stateReg',
    'cityReg',
    'crt',
    'cnae',
    'address',
    'number',
    'complement',
    'neighborhood',
    'city',
    'state',
    'zipCode',
    'phone',
    'email',
    'logo'
] as const;

// GET /api/configuracoes - Dados da empresa (primeira empresa cadastrada)
router.get('/', async (req: any, res: any) => {
    try {
        const empresa = await prisma.company.findFirst();
        if (!empresa) return res.status(404).json({ erro: "Nenhuma empresa configurada!" });

        const saida: any = { id: empresa.id };
        for (const campo of CAMPOS) {
            saida[campo] = empresa[campo] ?? null;
        }
        // Configurações do sistema (desconto, fidelidade, crediário)
        saida.settings = {
            descontoLimiteSemSenha: Number(await obterSetting<number>('desconto_limite_sem_senha', 0)),
            cashbackPercentual: Number(await obterSetting<number>('cashback_percentual', 0)),
            bloquearCrediarioLimite: Boolean(await obterSetting<boolean>('bloquear_crediario_limite', true))
        };
        // Formas de pagamento aceitas no PDV e parcelamento do crédito
        saida.pagamento = Object.assign({
            dinheiro: true,
            pix: true,
            debito: true,
            credito: true,
            creditoMaxParcelas: 1
        }, await obterSetting<any>('pagamento_config', {}));
        // Configurações de segurança (anti força bruta, sessão e política de senha)
        saida.seguranca = {
            loginMaxTentativas: Number(await obterSetting<number>('seg_login_max_tentativas', 5)),
            loginTravamentoMin: Number(await obterSetting<number>('seg_login_travamento_min', 15)),
            sessaoHoras: Number(await obterSetting<number>('seg_sessao_horas', 12)),
            senhaMinimo: Number(await obterSetting<number>('seg_senha_minimo', 8)),
            senhaExigeNumero: Boolean(await obterSetting<boolean>('seg_senha_exige_numero', true)),
            senhaExigeMaiuscula: Boolean(await obterSetting<boolean>('seg_senha_exige_maiuscula', true)),
            senhaExigeSimbolo: Boolean(await obterSetting<boolean>('seg_senha_exige_simbolo', false))
        };
        // Configuração do cupom fiscal (NFC-e)
        const nfePadrao = {
            habilitado: false,
            tpAmb: 1,
            serie: '1',
            proximoNumero: 1,
            cfopPadrao: '5102',
            csosnPadrao: '102',
            csc: '',
            cscId: '',
            qrcodeUrl: 'https://www.sefaz.am.gov.br/nfce/consulta'
        };
        // O CSC é segredo de uso exclusivo do backend (montagem do QR Code e emissão
        // da NFC-e). Nunca é devolvido ao frontend — apenas um indicador de configuração.
        const nfeConfig = await obterSetting<any>('nfe_config', {});
        saida.nfe = Object.assign(nfePadrao, nfeConfig);
        delete saida.nfe.csc;
        delete saida.nfe.cscId;
        saida.nfe.cscConfigurado = Boolean(
            String(nfeConfig.csc ?? '').trim() !== '' && String(nfeConfig.cscId ?? '').trim() !== ''
        );
        return res.json(saida);
    } catch (e: any) {
        return res.status(500).json({ erro: e.message });
    }
});

// POST /api/configuracoes - Atualiza dados da empresa (inclui logo em base64).
// Restrito a ADMIN/MANAGER/SUPERVISOR: um caixa não pode alterar dados fiscais,
// limite de desconto, políticas de segurança nem configurações de pagamento/NFC-e.
router.post('/', requerPermissao(...PERFIS_PRIVILEGIADOS), async (req: any, res: any) => {
    try {
        const empresa = await prisma.company.findFirst();
        if (!empresa) return res.status(404).json({ erro: "Nenhuma empresa configurada!" });

        const dados: any = { updatedAt: new Date() };
        for (const campo of CAMPOS) {
            if (req.body[campo] !== undefined) {
                if (campo === 'crt') {
                    dados[campo] = Number(req.body[campo]) || 1;
                } else {
                    dados[campo] = req.body[campo] === '' ? null : String(req.body[campo]);
                }
            }
        }

        await prisma.company.update({ where: { id: empresa.id }, data: dados });

        if (req.body.settings) {
            const s = req.body.settings;
            if (s.descontoLimiteSemSenha !== undefined) {
                await salvarSetting('desconto_limite_sem_senha', Math.max(0, Number(s.descontoLimiteSemSenha) || 0));
            }
            if (s.cashbackPercentual !== undefined) {
                await salvarSetting('cashback_percentual', Math.max(0, Math.min(100, Number(s.cashbackPercentual) || 0)));
            }
            if (s.bloquearCrediarioLimite !== undefined) {
                await salvarSetting('bloquear_crediario_limite', Boolean(s.bloquearCrediarioLimite));
            }
        }

        if (req.body.seguranca) {
            const g = req.body.seguranca;
            if (g.loginMaxTentativas !== undefined) {
                await salvarSetting('seg_login_max_tentativas', Math.max(1, Math.round(Number(g.loginMaxTentativas) || 5)));
            }
            if (g.loginTravamentoMin !== undefined) {
                await salvarSetting('seg_login_travamento_min', Math.max(1, Math.round(Number(g.loginTravamentoMin) || 15)));
            }
            if (g.sessaoHoras !== undefined) {
                await salvarSetting('seg_sessao_horas', Math.max(1, Math.round(Number(g.sessaoHoras) || 12)));
            }
            if (g.senhaMinimo !== undefined) {
                await salvarSetting('seg_senha_minimo', Math.max(4, Math.round(Number(g.senhaMinimo) || 8)));
            }
            if (g.senhaExigeNumero !== undefined) {
                await salvarSetting('seg_senha_exige_numero', Boolean(g.senhaExigeNumero));
            }
            if (g.senhaExigeMaiuscula !== undefined) {
                await salvarSetting('seg_senha_exige_maiuscula', Boolean(g.senhaExigeMaiuscula));
            }
            if (g.senhaExigeSimbolo !== undefined) {
                await salvarSetting('seg_senha_exige_simbolo', Boolean(g.senhaExigeSimbolo));
            }
        }

        if (req.body.pagamento) {
            const p = req.body.pagamento;
            const atual = await obterSetting<any>('pagamento_config', {});
            await salvarSetting('pagamento_config', {
                dinheiro: p.dinheiro !== undefined ? Boolean(p.dinheiro) : Boolean(atual.dinheiro ?? true),
                pix: p.pix !== undefined ? Boolean(p.pix) : Boolean(atual.pix ?? true),
                debito: p.debito !== undefined ? Boolean(p.debito) : Boolean(atual.debito ?? true),
                credito: p.credito !== undefined ? Boolean(p.credito) : Boolean(atual.credito ?? true),
                creditoMaxParcelas: Math.max(1, Math.min(12, Math.round(Number(p.creditoMaxParcelas) || (atual.creditoMaxParcelas ?? 1))))
            });
        }

        if (req.body.nfe) {
            const n = req.body.nfe;
            const atual = await obterSetting<any>('nfe_config', {});
            await salvarSetting('nfe_config', {
                habilitado: Boolean(n.habilitado),
                tpAmb: Number(n.tpAmb) === 2 ? 2 : 1,
                serie: String(n.serie ?? atual.serie ?? '1').padStart(3, '0'),
                proximoNumero: Math.max(1, Number(n.proximoNumero) || 1),
                cfopPadrao: String(n.cfopPadrao ?? atual.cfopPadrao ?? '5102'),
                csosnPadrao: String(n.csosnPadrao ?? atual.csosnPadrao ?? '102'),
                // CSC/CSC Id são write-only: só são alterados quando o frontend envia
                // um valor novo não-vazio (nunca é devolvido para leitura).
                csc: (n.csc !== undefined && String(n.csc).trim() !== '')
                    ? String(n.csc).trim()
                    : String(atual.csc ?? ''),
                cscId: (n.cscId !== undefined && String(n.cscId).trim() !== '')
                    ? String(n.cscId).trim()
                    : String(atual.cscId ?? ''),
                qrcodeUrl: String(n.qrcodeUrl ?? atual.qrcodeUrl ?? 'https://www.sefaz.am.gov.br/nfce/consulta')
            });
        }

        return res.json({ ok: true });
    } catch (e: any) {
        return res.status(500).json({ erro: e.message });
    }
});

export default router;
