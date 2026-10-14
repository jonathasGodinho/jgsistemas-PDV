import type { Product } from '@prisma/client';
import type { NfeConfig, VendaFiscal } from '../src/nfe/types';

/** Configuração mínima de NFC-e em homologação usada pelos testes fiscais (T-08.01/T-08.02). */
export const CFG: NfeConfig = {
    habilitado: true,
    tpAmb: 2,
    serie: '001',
    proximoNumero: 1,
    cfopPadrao: '5102',
    csosnPadrao: '102',
    csc: '',
    cscId: '',
    qrcodeUrl: ''
};

/** Produto de farmácia pronto para o cálculo fiscal; `over` sobrescreve os campos do cenário. */
export function produtoFiscal(over: Record<string, unknown> = {}): Product {
    return {
        id: 'prod-1',
        companyId: 'company-1',
        name: 'Dipirona Sódica 500mg',
        sku: null,
        barcode: '7891234567890',
        description: null,
        categoryId: null,
        brandId: null,
        supplierId: null,
        collectionId: null,
        costPrice: null,
        salePrice: null,
        profitMargin: null,
        ncm: '30049099',
        cest: null,
        cfop: '5102',
        csosn: '102',
        cst: null,
        icmsAliq: null,
        pisCst: null,
        pisAliq: null,
        cofinsCst: null,
        cofinsAliq: null,
        extraInfo: null,
        principioAtivo: null,
        tipoMedicamento: null,
        registroMS: null,
        pmc: null,
        unit: 'UN',
        weight: null,
        photos: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...over
    } as unknown as Product;
}

/** Venda fiscal de 1 item com valor base 100, usada para verificar o XML gerado. */
export function vendaFiscal(item: Product, vProd = 100): VendaFiscal {
    return {
        chave: '13261011111111000165650010000000011000000010',
        numero: '1',
        serie: '001',
        cNF: '12345678',
        cDV: '0',
        tpAmb: 2,
        dhEmi: '2026-10-14T10:00:00-04:00',
        itens: [
            {
                indice: 1,
                cProd: item.id,
                cEAN: '7891234567890',
                xProd: item.name,
                ncm: item.ncm ?? '30049099',
                cfop: '5102',
                unidade: 'UN',
                quantidade: 1,
                vUnit: vProd,
                vProd,
                vDesc: 0,
                produto: item
            }
        ],
        vProd,
        vDesc: 0,
        vNF: vProd,
        pagamentos: [{ tPag: '01', vPag: vProd, indPag: 0 }],
        emitente: {
            cnpj: '11222333000181',
            xNome: 'FARMACIA TESTE LTDA',
            xFant: 'FARMACIA TESTE',
            ender: {
                xLgr: 'RUA TESTE',
                nro: '100',
                xBairro: 'CENTRO',
                cMun: '1302603',
                xMun: 'MANAUS',
                UF: 'AM',
                CEP: '69000000'
            },
            IE: '123456789',
            CRT: 1
        },
        idDest: 1,
        indFinal: 1,
        indPres: 1
    };
}
