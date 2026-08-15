import prisma from '../db';
import { assinarXml, criarAssinador } from './cert';
import { gerarIdLote, montarChave } from './chave';
import { obterNfeConfig, reservarNumeroNfe, urlQrCode } from './config';
import { mapIndPag, mapTPag, arredondar } from './icms';
import { NS_NFE, primeiro, primeiroDentro, existe, xmlParaDoc } from './parse';
import { chamarSoap, SERVICOS } from './sefaz';
import { montarQrCode, urlChave } from './qrcode';
import { inserirQrCode, montarNfce } from './xml';
import type { NfeConfig, ResultadoEmissao, VendaCompleta, VendaFiscal, Emitente, Destinatario, ItemFiscal, PagamentoFiscal } from './types';

export function atraso(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

export function isoData(data: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    const offMin = -data.getTimezoneOffset();
    const sinal = offMin >= 0 ? '+' : '-';
    const abs = Math.abs(offMin);
    return (
        `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}` +
        `T${p(data.getHours())}:${p(data.getMinutes())}:${p(data.getSeconds())}` +
        `${sinal}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
    );
}

export async function carregarVenda(saleId: string): Promise<VendaCompleta | null> {
    return prisma.sale.findUnique({
        where: { id: saleId },
        include: {
            SaleItem: { include: { Product: true } },
            SalePayment: true,
            Customer: true,
            Company: true
        }
    });
}

interface DadosMontagem {
    chave: string;
    cNF: string;
    cDV: string;
    numero: number;
    serie: string;
    dhEmi: string;
}

function gtinValido(v?: string | null): boolean {
    if (!v) return false;
    return /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(v);
}

export function montarVendaFiscal(venda: VendaCompleta, cfg: NfeConfig, dados: DadosMontagem): VendaFiscal {
    const empresa = venda.Company;
    if (!empresa) throw new Error('Venda sem empresa vinculada.');

    const cliente = venda.Customer ?? null;
    const docCliente = (cliente?.document ?? '').replace(/\D/g, '');

    const emitente: Emitente = {
        cnpj: (empresa.document ?? '').replace(/\D/g, ''),
        xNome: empresa.name,
        xFant: empresa.tradeName ?? '',
        ender: {
            xLgr: empresa.address ?? '',
            nro: empresa.number ?? '',
            xCpl: empresa.complement ?? undefined,
            xBairro: empresa.neighborhood ?? '',
            cMun: empresa.cityCode ?? '',
            xMun: empresa.city ?? '',
            UF: empresa.state ?? '',
            CEP: empresa.zipCode ?? '',
            fone: empresa.phone ?? undefined
        },
        IE: empresa.stateReg ?? '',
        CRT: empresa.crt
    };

    const destinatario: Destinatario | undefined = cliente
        ? {
              cpf: /^\d{11}$/.test(docCliente) ? docCliente : undefined,
              cnpj: /^\d{14}$/.test(docCliente) ? docCliente : undefined,
              xNome: cliente.name,
              ender: cliente.cityCode
                  ? {
                        xLgr: cliente.address ?? '',
                        nro: cliente.number ?? '',
                        xCpl: cliente.complement ?? undefined,
                        xBairro: cliente.neighborhood ?? '',
                        cMun: cliente.cityCode ?? '',
                        xMun: cliente.city ?? '',
                        UF: cliente.state ?? '',
                        CEP: cliente.zipCode ?? ''
                    }
                  : undefined,
              IE: cliente.stateReg ?? undefined
          }
        : undefined;

    const itens: ItemFiscal[] = venda.SaleItem.map((item, idx) => {
        const produto = item.Product;
        const barcode = produto.barcode ?? '';
        return {
            indice: idx + 1,
            cProd: (produto.sku || produto.id).slice(0, 60),
            cEAN: gtinValido(barcode) ? barcode : 'SEM GTIN',
            xProd: produto.name,
            ncm: produto.ncm ?? '',
            cest: produto.cest ?? undefined,
            cfop: produto.cfop || cfg.cfopPadrao,
            unidade: produto.unit || 'UN',
            quantidade: item.quantity,
            vUnit: Number(item.unitPrice),
            vProd: arredondar(Number(item.subtotal)),
            vDesc: arredondar(Number(item.discount)),
            produto
        };
    });

    const pagamentos: PagamentoFiscal[] = venda.SalePayment.map((p) => ({
        tPag: mapTPag(p.method),
        indPag: Number(mapIndPag(p.installments)),
        vPag: arredondar(Number(p.amount))
    }));

    const vProd = arredondar(itens.reduce((s, i) => s + i.vProd, 0));
    const vDesc = arredondar(itens.reduce((s, i) => s + i.vDesc, 0));
    const vNF = arredondar(Number(venda.total));

    const mesmaUf = cliente?.state && cliente.state === empresa.state;
    const idDest = !cliente || !cliente.state ? 1 : mesmaUf ? 1 : 2;

    return {
        chave: dados.chave,
        numero: String(dados.numero).padStart(9, '0'),
        serie: dados.serie,
        cNF: dados.cNF,
        cDV: dados.cDV,
        tpAmb: cfg.tpAmb,
        dhEmi: dados.dhEmi,
        itens,
        vProd,
        vDesc,
        vNF,
        pagamentos,
        emitente,
        destinatario,
        idDest,
        indFinal: 1,
        indPres: 1,
        infCpl: venda.notes ?? undefined
    };
}

interface ContextoEmissao {
    chave: string;
    numero: number;
    serie: string;
    xmlEnviado: string;
}

async function registrar(saleId: string, r: ResultadoEmissao, tpAmb: number): Promise<ResultadoEmissao> {
    const ok = Boolean(r.ok);
    await prisma.sale.update({
        where: { id: saleId },
        data: {
            nfeStatus: ok ? 'AUTORIZADA' : r.status ?? 'FALHA',
            nfeKey: r.chave ?? null,
            nfeNumber: r.numero ?? null,
            nfeSerie: r.serie ?? null,
            nfceKey: r.chave ?? null,
            nfceNumber: r.numero ?? null,
            nfeProtocol: r.protocolo ?? null,
            nfeXmlEnviado: r.xmlEnviado ?? null,
            nfeXmlRetorno: r.xmlRetorno ?? null,
            nfeError: ok ? null : r.mensagem ?? null,
            nfeTpAmb: tpAmb,
            nfeEmitidoAt: ok ? new Date() : null
        }
    });
    return r;
}

async function registrarFalha(
    saleId: string,
    status: string,
    mensagem: string,
    tpAmb: number,
    ctx?: Partial<ContextoEmissao> & { xmlRetorno?: string }
): Promise<ResultadoEmissao> {
    const r: ResultadoEmissao = {
        ok: false,
        status,
        mensagem,
        chave: ctx?.chave,
        numero: ctx?.numero ? String(ctx.numero).padStart(9, '0') : undefined,
        serie: ctx?.serie,
        xmlEnviado: ctx?.xmlEnviado,
        xmlRetorno: ctx?.xmlRetorno
    };
    return registrar(saleId, r, tpAmb);
}

export async function emitirNfce(saleId: string): Promise<ResultadoEmissao> {
    const cfg = await obterNfeConfig();
    if (!cfg.habilitado) {
        return { ok: false, status: 'DESATIVADO', mensagem: 'Emissão de NFC-e desativada nas configurações.' };
    }

    const venda = await carregarVenda(saleId);
    if (!venda) throw new Error('Venda não encontrada');

    if (venda.nfeStatus === 'AUTORIZADA' || venda.nfeStatus === 'CANCELADA') {
        return {
            ok: venda.nfeStatus === 'AUTORIZADA',
            status: venda.nfeStatus,
            protocolo: venda.nfeProtocol ?? undefined,
            chave: venda.nfeKey ?? undefined,
            numero: venda.nfeNumber ?? undefined,
            serie: venda.nfeSerie ?? undefined
        };
    }
    if (venda.status !== 'COMPLETED') {
        return { ok: false, status: 'VENDAPENDENTE', mensagem: 'A venda precisa estar COMPLETED para emissão da NFC-e.' };
    }
    if (venda.SaleItem.length === 0) {
        return { ok: false, status: 'SEMITENS', mensagem: 'A venda não possui itens para emitir NFC-e.' };
    }
    const empresa = venda.Company;
    if (!empresa) {
        return { ok: false, status: 'SEMEMPRESA', mensagem: 'Venda sem empresa configurada.' };
    }

    const assinador = await criarAssinador();
    const agora = new Date();
    const serie = venda.nfeSerie ?? cfg.serie;
    let numero: number;
    let chave: string;
    let cNF: string;
    let cDV: string;

    if (venda.nfeKey) {
        chave = venda.nfeKey;
        numero = Number(venda.nfeNumber ?? venda.nfceNumber ?? 0) || 0;
        cNF = chave.slice(35, 43);
        cDV = chave.slice(43, 44);
    } else {
        numero = await reservarNumeroNfe();
        const ano = String(agora.getFullYear()).slice(2);
        const mes = String(agora.getMonth() + 1).padStart(2, '0');
        const gerado = montarChave({ cnpj: empresa.document ?? '', ano, mes, serie, numero: String(numero) });
        chave = gerado.chave;
        cNF = gerado.cNF;
        cDV = gerado.cDV;
    }

    const vendaFiscal = montarVendaFiscal(venda, cfg, { chave, cNF, cDV, numero, serie, dhEmi: isoData(agora) });

    let xmlEnviado: string;
    try {
        const xmlSemAssinatura = montarNfce(vendaFiscal, cfg);
        const xmlAssinado = await assinarXml(xmlSemAssinatura, assinador);
        const qrCodeUrl = montarQrCode({
            chave,
            tpAmb: cfg.tpAmb,
            cscId: cfg.cscId,
            csc: cfg.csc,
            urlBase: urlQrCode(cfg)
        });
        const urlConsulta = urlChave({ urlBase: urlQrCode(cfg), chave });
        xmlEnviado = inserirQrCode(xmlAssinado, qrCodeUrl, urlConsulta);
    } catch (e) {
        const erro = e instanceof Error ? e.message : String(e);
        return registrarFalha(venda.id, 'ERRO_ASSINATURA', erro, cfg.tpAmb, { chave, numero, serie });
    }

    const lote = `<enviNFe xmlns="${NS_NFE}" versao="4.00"><idLote>${gerarIdLote()}</idLote><indSinc>0</indSinc>${xmlEnviado}</enviNFe>`;

    try {
        const resp = await chamarSoap(SERVICOS.AUTORIZACAO, cfg.tpAmb, lote);
        const doc = xmlParaDoc(resp.body);
        const cStat = primeiro(doc, 'cStat') ?? '';
        const motivo = primeiro(doc, 'xMotivo') ?? '';
        const recibo = primeiro(doc, 'nRec');

        if (cStat === '103' && recibo) {
            return processarRecibo(venda.id, cfg, { chave, numero, serie, xmlEnviado: lote, recibo });
        }
        return registrarFalha(venda.id, 'REJEITADA', `${cStat} - ${motivo}`, cfg.tpAmb, {
            chave,
            numero,
            serie,
            xmlEnviado: lote,
            xmlRetorno: resp.body
        });
    } catch (e) {
        const erro = e instanceof Error ? e.message : String(e);
        return registrarFalha(venda.id, 'ERRO_TRANSMISSAO', erro, cfg.tpAmb, { chave, numero, serie, xmlEnviado: lote });
    }
}

async function processarRecibo(
    saleId: string,
    cfg: NfeConfig,
    ctx: ContextoEmissao & { recibo: string }
): Promise<ResultadoEmissao> {
    const { chave, numero, serie, xmlEnviado, recibo } = ctx;

    for (let i = 0; i < 15; i++) {
        await atraso(2500);
        const consulta = `<consReciNFe xmlns="${NS_NFE}" versao="4.00"><tpAmb>${cfg.tpAmb}</tpAmb><nRec>${recibo}</nRec></consReciNFe>`;
        let resp;
        try {
            resp = await chamarSoap(SERVICOS.RET_AUTORIZACAO, cfg.tpAmb, consulta);
        } catch {
            continue;
        }

        const doc = xmlParaDoc(resp.body);
        const cStat = primeiro(doc, 'cStat') ?? '';
        const motivo = primeiro(doc, 'xMotivo') ?? '';
        const protCStat = primeiroDentro(doc, 'infProt', 'cStat') ?? cStat;
        const protocolo = primeiroDentro(doc, 'infProt', 'nProt');
        const temProtocolo = existe(doc, 'protNFe');

        if (temProtocolo && (protCStat === '100' || cStat === '100')) {
            const resultado: ResultadoEmissao = {
                ok: true,
                status: 'AUTORIZADA',
                protocolo,
                recibo,
                chave,
                numero: String(numero).padStart(9, '0'),
                serie,
                xmlEnviado,
                xmlRetorno: resp.body
            };
            return registrar(saleId, resultado, cfg.tpAmb);
        }
        if (temProtocolo || cStat !== '105') {
            return registrarFalha(saleId, 'REJEITADA', `${protCStat} - ${motivo}`, cfg.tpAmb, {
                chave,
                numero,
                serie,
                xmlEnviado,
                xmlRetorno: resp.body
            });
        }
    }

    return registrarFalha(saleId, 'PENDENTE', 'Tempo esgotado aguardando processamento do lote.', cfg.tpAmb, {
        chave,
        numero,
        serie,
        xmlEnviado
    });
}
