import prisma from '../db';
import { randomUUID } from 'crypto';
import { assinarXml, criarAssinador } from './cert';
import { idEvento } from './chave';
import { obterNfeConfig } from './config';
import { carregarVenda, isoData } from './emissor';
import { NS_NFE, primeiro, primeiroDentro, xmlParaDoc } from './parse';
import { chamarSoap, SERVICOS } from './sefaz';
import type { ResultadoEmissao } from './types';

export async function cancelarNfce(saleId: string, justificativa: string): Promise<ResultadoEmissao> {
    const cfg = await obterNfeConfig();
    if (!cfg.habilitado) {
        return { ok: false, status: 'DESATIVADO', mensagem: 'Emissão de NFC-e desativada nas configurações.' };
    }

    const textoJust = (justificativa ?? '').trim();
    if (textoJust.length < 15) {
        return {
            ok: false,
            status: 'JUSTIFICATIVA',
            mensagem: 'Justificativa de cancelamento deve ter no mínimo 15 caracteres.'
        };
    }

    const venda = await carregarVenda(saleId);
    if (!venda) throw new Error('Venda não encontrada');

    if (venda.nfeStatus !== 'AUTORIZADA') {
        return {
            ok: false,
            status: venda.nfeStatus ?? 'NAO_AUTORIZADA',
            mensagem: 'Somente NFC-e autorizadas podem ser canceladas.'
        };
    }

    const empresa = venda.Company;
    if (!empresa) return { ok: false, status: 'SEMEMPRESA', mensagem: 'Venda sem empresa configurada.' };

    const chave = venda.nfeKey;
    const protocolo = venda.nfeProtocol;
    if (!chave || !protocolo) {
        return { ok: false, status: 'SEMPROTOCOLO', mensagem: 'Chave ou protocolo da NFC-e ausentes na venda.' };
    }

    const seq = (await prisma.nfeEvent.count({ where: { saleId } })) + 1;
    const dhEvento = isoData(new Date());
    const assinador = await criarAssinador();

    const infEvento =
        `<infEvento Id="${idEvento('110111', chave, seq)}">` +
        `<cOrgao>13</cOrgao><tpAmb>${cfg.tpAmb}</tpAmb><CNPJ>${(empresa.document ?? '').replace(/\D/g, '')}</CNPJ>` +
        `<chNFe>${chave}</chNFe><dhEvento>${dhEvento}</dhEvento><tpEvento>110111</tpEvento>` +
        `<nSeqEvento>${seq}</nSeqEvento><verEvento>1.00</verEvento>` +
        `<detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${protocolo}</nProt>` +
        `<xJust>${textoJust}</xJust></detEvento></infEvento>`;

    let xmlEvento: string;
    try {
        const evento = `<evento versao="1.00" xmlns="${NS_NFE}">${infEvento}</evento>`;
        const assinado = await assinarXml(evento, assinador, "//*[local-name(.)='infEvento']");
        xmlEvento = `<envEvento xmlns="${NS_NFE}" versao="1.00"><idLote>${seq}</idLote>${assinado}</envEvento>`;
    } catch (e) {
        const erro = e instanceof Error ? e.message : String(e);
        return { ok: false, status: 'ERRO_ASSINATURA', mensagem: erro };
    }

    try {
        const resp = await chamarSoap(SERVICOS.RECEPCAO_EVENTO, cfg.tpAmb, xmlEvento);
        const doc = xmlParaDoc(resp.body);
        const cStatLote = primeiro(doc, 'cStat') ?? '';
        const motivo = primeiro(doc, 'xMotivo') ?? '';
        const cStatEvento = primeiroDentro(doc, 'retEvento', 'cStat') ?? cStatLote;
        const protocoloEvento = primeiroDentro(doc, 'infEvento', 'nProt') ?? primeiroDentro(doc, 'retEvento', 'nProt');
        const ok = cStatEvento === '135' || cStatEvento === '136';

        await prisma.nfeEvent.create({
            data: {
                id: randomUUID(),
                saleId,
                eventType: '110111',
                sequence: seq,
                protocol: ok ? protocoloEvento ?? null : null,
                xmlEnviado: xmlEvento,
                xmlRetorno: resp.body
            }
        });

        await prisma.sale.update({
            where: { id: saleId },
            data: {
                nfeStatus: ok ? 'CANCELADA' : 'ERRO_EVENTO',
                nfeError: ok ? null : `${cStatEvento} - ${motivo}`,
                nfeXmlRetorno: resp.body
            }
        });

        return {
            ok,
            status: ok ? 'CANCELADA' : 'ERRO_EVENTO',
            protocolo: protocoloEvento,
            chave,
            mensagem: ok ? undefined : `${cStatEvento} - ${motivo}`,
            xmlRetorno: resp.body
        };
    } catch (e) {
        const erro = e instanceof Error ? e.message : String(e);
        return { ok: false, status: 'ERRO_TRANSMISSAO', mensagem: erro };
    }
}
