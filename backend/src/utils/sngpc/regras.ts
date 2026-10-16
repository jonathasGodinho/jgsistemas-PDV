// Regras de domínio do SNGPC (farmácia Fase 2).
// Fontes: Guia SNGPC v2.3 (st_TipoReceituario p.19; regras 5-7 p.10-11) e decisões
// D-04, D-08 e D-25 em docs/sprintx/features/farmacia-controlados/00-DECISOES.md.

export type ClasseSngpc = 'CONTROLADO' | 'ANTIMICROBIANO';

export const CLASSES_SNGPC: ClasseSngpc[] = ['CONTROLADO', 'ANTIMICROBIANO'];
export const LISTAS_PORTARIA_344 = ['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'C3', 'C4', 'C5'];

/** classeTerapeutica do XML: 1 antimicrobiano, 2 sujeito a controle especial (Guia p.18). */
export const CLASSE_TERAPEUTICA: Record<ClasseSngpc, number> = { ANTIMICROBIANO: 1, CONTROLADO: 2 };

// D-08: tipo de receituário pela lista (st_TipoReceituario): 1 Receita de Controle Especial,
// 2 Notificação B, 3 Notificação Especial, 4 Notificação A, 5 Receita antimicrobiano.
const TIPO_POR_LISTA: Record<string, number> = {
    A1: 4, A2: 4, A3: 4,
    B1: 2, B2: 2,
    C1: 1, C2: 3, C3: 3, C4: 1, C5: 1
};

export function tipoReceituarioDoProduto(p: { classeSngpc?: string | null; listaPortaria344?: string | null }): number | null {
    if (p.classeSngpc === 'ANTIMICROBIANO') return 5;
    if (p.classeSngpc === 'CONTROLADO') return (p.listaPortaria344 && TIPO_POR_LISTA[p.listaPortaria344]) || null;
    return null;
}

/** D-04: 10 dias para antimicrobiano (RDC 471 art. 7º); 30 dias para os receituários da Portaria 344. */
export function validadeDias(tipoReceituario: number): number {
    return tipoReceituario === 5 ? 10 : 30;
}

function diaCivil(d: Date | string): number {
    const x = typeof d === 'string' ? new Date(`${d.slice(0, 10)}T00:00:00`) : new Date(d);
    return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86_400_000;
}

/** Vencida quando passaram mais dias que a validade desde a prescrição, ou quando a prescrição é futura. */
export function receitaVencida(tipoReceituario: number, dataPrescricao: Date | string, hoje: Date = new Date()): boolean {
    const passados = diaCivil(hoje) - diaCivil(dataPrescricao);
    return passados < 0 || passados > validadeDias(tipoReceituario);
}

/** D-25 (Guia p.10-11, regras 6 e 7). */
export function conselhosPermitidos(classe: ClasseSngpc, uso: number): string[] {
    if (classe === 'ANTIMICROBIANO') return ['COREN', 'CRO', 'CRF', 'CRM', 'CRMV', 'RMS'];
    return uso === 2 ? ['CRMV'] : ['CRO', 'CRF', 'CRM', 'RMS'];
}
