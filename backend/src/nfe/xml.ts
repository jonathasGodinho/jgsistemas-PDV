import { DOMImplementation, XMLSerializer, type Document, type Element } from '@xmldom/xmldom';
import { calcImpostoItem } from './icms';
import type { ItemFiscal, NfeConfig, VendaFiscal } from './types';

const NS = 'http://www.portalfiscal.inf.br/nfe';
const VERSAO = '4.00';

function fmt2(v: number): string {
    return v.toFixed(2);
}

function fmtQtd(v: number): string {
    return v.toFixed(4);
}

function fmtUnit(v: number): string {
    const [inteiro, decimal] = v.toFixed(10).split('.');
    let frac = (decimal ?? '').replace(/0+$/, '');
    if (frac.length < 2) frac = frac.padEnd(2, '0');
    return `${inteiro}.${frac}`;
}

function gtinValido(v?: string | null): boolean {
    if (!v) return false;
    return /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(v);
}

function criarElemento(
    doc: Document,
    pai: Element,
    tag: string,
    texto?: string | number
): Element {
    const el = doc.createElementNS(NS, tag);
    if (texto !== undefined && texto !== null && texto !== '') {
        el.appendChild(doc.createTextNode(String(texto)));
    }
    pai.appendChild(el);
    return el;
}

export function validarDadosFiscais(venda: VendaFiscal, cfg: NfeConfig): string[] {
    const erros: string[] = [];
    const e = venda.emitente;
    if (!/^\d{14}$/.test(e.cnpj)) erros.push('CNPJ da empresa deve ter 14 dígitos');
    if (!e.IE) erros.push('Inscrição Estadual (IE) da empresa é obrigatória');
    if (!e.ender.cMun) erros.push('Código do município (IBGE) da empresa é obrigatório');
    if (!e.ender.xMun) erros.push('Cidade da empresa é obrigatória');
    if (!e.ender.UF) erros.push('UF da empresa é obrigatória');
    if (!e.ender.CEP) erros.push('CEP da empresa é obrigatório');
    if (!e.xNome) erros.push('Razão social da empresa é obrigatória');

    for (const item of venda.itens) {
        if (!item.ncm) erros.push(`Produto "${item.xProd}" sem NCM`);
        if (!/^\d{4}$/.test(item.cfop)) erros.push(`Produto "${item.xProd}" sem CFOP válido`);
        if (!cfg.csosnPadrao && !item.produto.csosn) {
            erros.push(`Produto "${item.xProd}" sem CSOSN`);
        }
    }
    return erros;
}

export function montarNfce(venda: VendaFiscal, cfg: NfeConfig): string {
    const erros = validarDadosFiscais(venda, cfg);
    if (erros.length > 0) {
        throw new Error('Dados fiscais incompletos:\n- ' + erros.join('\n- '));
    }

    const impl = new DOMImplementation();
    const doc = impl.createDocument(NS, 'NFCe', null) as Document;
    const raiz = doc.documentElement as Element;

    const infNFe = criarElemento(doc, raiz, 'infNFe');
    infNFe.setAttribute('versao', VERSAO);
    infNFe.setAttribute('Id', `NFe${venda.chave}`);

    // ide
    const ide = criarElemento(doc, infNFe, 'ide');
    criarElemento(doc, ide, 'cUF', '13');
    criarElemento(doc, ide, 'cNF', venda.cNF);
    criarElemento(doc, ide, 'natOp', 'VENDA');
    criarElemento(doc, ide, 'mod', '65');
    criarElemento(doc, ide, 'serie', venda.serie);
    criarElemento(doc, ide, 'nNF', venda.numero);
    criarElemento(doc, ide, 'dhEmi', venda.dhEmi);
    criarElemento(doc, ide, 'tpNF', '1');
    criarElemento(doc, ide, 'idDest', String(venda.idDest));
    criarElemento(doc, ide, 'cMunFG', venda.emitente.ender.cMun);
    criarElemento(doc, ide, 'tpImp', '1');
    criarElemento(doc, ide, 'tpEmis', '1');
    criarElemento(doc, ide, 'cDV', venda.cDV);
    criarElemento(doc, ide, 'tpAmb', String(venda.tpAmb));
    criarElemento(doc, ide, 'finNFe', '1');
    criarElemento(doc, ide, 'indFinal', String(venda.indFinal));
    criarElemento(doc, ide, 'indPres', String(venda.indPres));
    criarElemento(doc, ide, 'procEmi', '0');
    criarElemento(doc, ide, 'verProc', 'JG ERP 1.0');

    // emit
    const emit = criarElemento(doc, infNFe, 'emit');
    criarElemento(doc, emit, 'CNPJ', venda.emitente.cnpj);
    criarElemento(doc, emit, 'xNome', venda.emitente.xNome);
    if (venda.emitente.xFant) criarElemento(doc, emit, 'xFant', venda.emitente.xFant);
    const enderEmit = criarElemento(doc, emit, 'enderEmit');
    criarElemento(doc, enderEmit, 'xLgr', venda.emitente.ender.xLgr);
    criarElemento(doc, enderEmit, 'nro', venda.emitente.ender.nro);
    if (venda.emitente.ender.xCpl) criarElemento(doc, enderEmit, 'xCpl', venda.emitente.ender.xCpl);
    criarElemento(doc, enderEmit, 'xBairro', venda.emitente.ender.xBairro);
    criarElemento(doc, enderEmit, 'cMun', venda.emitente.ender.cMun);
    criarElemento(doc, enderEmit, 'xMun', venda.emitente.ender.xMun);
    criarElemento(doc, enderEmit, 'UF', venda.emitente.ender.UF);
    criarElemento(doc, enderEmit, 'CEP', venda.emitente.ender.CEP);
    criarElemento(doc, enderEmit, 'cPais', '1058');
    criarElemento(doc, enderEmit, 'xPais', 'BRASIL');
    if (venda.emitente.ender.fone) criarElemento(doc, enderEmit, 'fone', venda.emitente.ender.fone);
    criarElemento(doc, emit, 'IE', venda.emitente.IE);
    criarElemento(doc, emit, 'CRT', String(venda.emitente.CRT));

    // dest
    if (venda.destinatario) {
        const dest = criarElemento(doc, infNFe, 'dest');
        if (venda.destinatario.cnpj) {
            criarElemento(doc, dest, 'CNPJ', venda.destinatario.cnpj);
        } else if (venda.destinatario.cpf) {
            criarElemento(doc, dest, 'CPF', venda.destinatario.cpf);
        }
        criarElemento(doc, dest, 'xNome', venda.destinatario.xNome ?? 'CONSUMIDOR FINAL');
        if (venda.destinatario.ender) {
            const enderDest = criarElemento(doc, dest, 'enderDest');
            criarElemento(doc, enderDest, 'xLgr', venda.destinatario.ender.xLgr);
            criarElemento(doc, enderDest, 'nro', venda.destinatario.ender.nro);
            if (venda.destinatario.ender.xCpl) criarElemento(doc, enderDest, 'xCpl', venda.destinatario.ender.xCpl);
            criarElemento(doc, enderDest, 'xBairro', venda.destinatario.ender.xBairro);
            criarElemento(doc, enderDest, 'cMun', venda.destinatario.ender.cMun);
            criarElemento(doc, enderDest, 'xMun', venda.destinatario.ender.xMun);
            criarElemento(doc, enderDest, 'UF', venda.destinatario.ender.UF);
            criarElemento(doc, enderDest, 'CEP', venda.destinatario.ender.CEP);
        }
        criarElemento(doc, dest, 'indIEDest', venda.destinatario.IE ? '1' : '9');
        if (venda.destinatario.IE) criarElemento(doc, dest, 'IE', venda.destinatario.IE);
    }

    // det
    for (const item of venda.itens) {
        montarDet(doc, infNFe, item, cfg);
    }

    // total
    const total = criarElemento(doc, infNFe, 'total');
    const icmsTot = criarElemento(doc, total, 'ICMSTot');
    criarElemento(doc, icmsTot, 'vBC', fmt2(0));
    criarElemento(doc, icmsTot, 'vICMS', fmt2(0));
    criarElemento(doc, icmsTot, 'vICMSDeson', fmt2(0));
    criarElemento(doc, icmsTot, 'vFCP', fmt2(0));
    criarElemento(doc, icmsTot, 'vBCST', fmt2(0));
    criarElemento(doc, icmsTot, 'vST', fmt2(0));
    criarElemento(doc, icmsTot, 'vFCPST', fmt2(0));
    criarElemento(doc, icmsTot, 'vFCPSTRet', fmt2(0));
    criarElemento(doc, icmsTot, 'vProd', fmt2(venda.vProd));
    criarElemento(doc, icmsTot, 'vFrete', fmt2(0));
    criarElemento(doc, icmsTot, 'vSeg', fmt2(0));
    criarElemento(doc, icmsTot, 'vDesc', fmt2(venda.vDesc));
    criarElemento(doc, icmsTot, 'vII', fmt2(0));
    criarElemento(doc, icmsTot, 'vIPI', fmt2(0));
    criarElemento(doc, icmsTot, 'vPIS', fmt2(0));
    criarElemento(doc, icmsTot, 'vCOFINS', fmt2(0));
    criarElemento(doc, icmsTot, 'vOutro', fmt2(0));
    criarElemento(doc, icmsTot, 'vNF', fmt2(venda.vNF));

    // transp
    const transp = criarElemento(doc, infNFe, 'transp');
    criarElemento(doc, transp, 'modFrete', '9');

    // pag
    montarPag(doc, infNFe, venda);

    // infAdic
    if (venda.infCpl) {
        const infAdic = criarElemento(doc, infNFe, 'infAdic');
        criarElemento(doc, infAdic, 'infCpl', venda.infCpl);
    }

    const xml = new XMLSerializer().serializeToString(doc);
    return '<?xml version="1.0" encoding="UTF-8"?>' + xml;
}

function montarDet(doc: Document, infNFe: Element, item: ItemFiscal, cfg: NfeConfig): void {
    const det = doc.createElementNS(NS, 'det');
    det.setAttribute('nItem', String(item.indice));
    infNFe.appendChild(det);

    const prod = criarElemento(doc, det, 'prod');
    criarElemento(doc, prod, 'cProd', item.cProd);
    criarElemento(doc, prod, 'cEAN', item.cEAN);
    criarElemento(doc, prod, 'xProd', item.xProd);
    criarElemento(doc, prod, 'NCM', item.ncm);
    if (item.cest) criarElemento(doc, prod, 'CEST', item.cest);
    criarElemento(doc, prod, 'CFOP', item.cfop);
    criarElemento(doc, prod, 'uCom', item.unidade);
    criarElemento(doc, prod, 'qCom', fmtQtd(item.quantidade));
    criarElemento(doc, prod, 'vUnCom', fmtUnit(item.vUnit));
    criarElemento(doc, prod, 'vProd', fmt2(item.vProd));
    criarElemento(doc, prod, 'cEANTrib', item.cEAN);
    criarElemento(doc, prod, 'uTrib', item.unidade);
    criarElemento(doc, prod, 'qTrib', fmtQtd(item.quantidade));
    criarElemento(doc, prod, 'vUnTrib', fmtUnit(item.vUnit));
    if (item.vDesc > 0) criarElemento(doc, prod, 'vDesc', fmt2(item.vDesc));
    criarElemento(doc, prod, 'indTot', '1');

    const imposto = criarElemento(doc, det, 'imposto');
    criarElemento(doc, imposto, 'vItem12741', fmt2(0));

    const icms = criarElemento(doc, imposto, 'ICMS');
    const imp = calcImpostoItem(item.vProd, item.produto, cfg);
    const icmsSn = criarElemento(doc, icms, 'ICMSSN');
    criarElemento(doc, icmsSn, 'orig', String(imp.icms.cOrig));
    criarElemento(doc, icmsSn, 'CSOSN', imp.icms.csosn);

    const pis = criarElemento(doc, imposto, 'PIS');
    const pisOutr = criarElemento(doc, pis, 'PISOutr');
    criarElemento(doc, pisOutr, 'CST', imp.pis.cst);
    criarElemento(doc, pisOutr, 'vBC', fmt2(imp.pis.vBC));
    criarElemento(doc, pisOutr, 'pPIS', fmt2(imp.pis.pPIS));
    criarElemento(doc, pisOutr, 'vPIS', fmt2(imp.pis.vPIS));

    const cofins = criarElemento(doc, imposto, 'COFINS');
    const cofinsOutr = criarElemento(doc, cofins, 'COFINSOutr');
    criarElemento(doc, cofinsOutr, 'CST', imp.cofins.cst);
    criarElemento(doc, cofinsOutr, 'vBC', fmt2(imp.cofins.vBC));
    criarElemento(doc, cofinsOutr, 'pCOFINS', fmt2(imp.cofins.pCOFINS));
    criarElemento(doc, cofinsOutr, 'vCOFINS', fmt2(imp.cofins.vCOFINS));
}

function montarPag(doc: Document, infNFe: Element, venda: VendaFiscal): void {
    const pag = criarElemento(doc, infNFe, 'pag');
    const pagamentos = [...venda.pagamentos];
    let totalPago = pagamentos.reduce((s, p) => s + p.vPag, 0);

    if (totalPago < venda.vNF) {
        pagamentos.push({ tPag: '99', vPag: venda.vNF - totalPago, indPag: 0 });
        totalPago = venda.vNF;
    }

    for (const p of pagamentos) {
        const detPag = criarElemento(doc, pag, 'detPag');
        criarElemento(doc, detPag, 'indPag', String(p.indPag));
        criarElemento(doc, detPag, 'tPag', p.tPag);
        criarElemento(doc, detPag, 'vPag', fmt2(p.vPag));
    }
}

function xmlEscape(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function inserirQrCode(xmlAssinado: string, qrCodeUrl: string, urlChave: string): string {
    const supl =
        `<infNFeSupl><qrCode>${xmlEscape(qrCodeUrl)}</qrCode>` +
        `<urlChave>${xmlEscape(urlChave)}</urlChave></infNFeSupl>`;
    if (!/^<infNFeSupl>/.test(xmlAssinado) && xmlAssinado.includes('<Signature')) {
        return xmlAssinado.replace('<Signature', `${supl}<Signature`);
    }
    return xmlAssinado;
}
