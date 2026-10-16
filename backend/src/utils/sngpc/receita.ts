// Validação da receita de produto SNGPC (farmácia Fase 2).
// Fontes: Guia SNGPC v2.3 §4.2 (obrigatoriedade de comprador/paciente, número opcional no tipo 5,
// conselhos, máximo de 999 por item) e decisões D-04, D-10, D-24 e D-25.
import { ClasseSngpc, conselhosPermitidos, receitaVencida, tipoReceituarioDoProduto } from './regras';

export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI',
    'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

// st_TipoDocumento (sngpc-go simple_types.go:177-198, espelho do XSD oficial).
export const TIPOS_DOCUMENTO = [1, 2, 4, 5, 6, 7, 8, 10, 11, 13, 14, 19, 20, 21, 22, 38, 39, 40, 50, 62];

export type ReceitaEntrada = {
    numero?: string | null;
    dataPrescricao?: string | null;
    uso?: number | null;
    prescritor?: { nome?: string; conselho?: string; numero?: string; uf?: string } | null;
    comprador?: { nome?: string; tipoDocumento?: number; documento?: string; orgaoExpedidor?: string; uf?: string } | null;
    paciente?: { nome?: string; idade?: number; unidadeIdade?: number; sexo?: number; cid?: string | null } | null;
    quantidadeConfirmada?: boolean;
};

export type ProdutoReceita = { name: string; classeSngpc?: string | null; listaPortaria344?: string | null; qtdMaxReceita?: number | null };

export type AlertaReceita = { codigo: 'QTD_ACIMA_MAXIMO'; produto: string; quantidade: number; maximo: number };

const texto = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());

export function validarReceita(
    r: ReceitaEntrada | null | undefined,
    itens: { produto: ProdutoReceita; quantidade: number }[],
    hoje: Date = new Date()
): { erros: string[]; alertas: AlertaReceita[]; tipoReceituario: number | null; classe: ClasseSngpc | null } {
    const erros: string[] = [];
    const alertas: AlertaReceita[] = [];
    if (!r) return { erros: ['Receita obrigatória para medicamento controlado ou antimicrobiano!'], alertas, tipoReceituario: null, classe: null };

    const tipos = new Set(itens.map(i => tipoReceituarioDoProduto(i.produto)));
    const classes = new Set(itens.map(i => i.produto.classeSngpc ?? null));
    if (tipos.size !== 1 || classes.size !== 1) {
        erros.push('Itens de tipos de receituário diferentes não podem estar na mesma receita!');
    }
    const tipo = [...tipos][0] ?? null;
    const classe = ([...classes][0] ?? null) as ClasseSngpc | null;
    if (tipo === null || classe === null) {
        erros.push('Produto sem classe SNGPC ou sem lista da Portaria 344 não usa receita!');
        return { erros, alertas, tipoReceituario: null, classe: null };
    }

    // Data e validade (D-04)
    const data = texto(r.dataPrescricao);
    if (!/^\d{4}-\d{2}-\d{2}/.test(data) || Number.isNaN(new Date(`${data.slice(0, 10)}T00:00:00`).getTime())) {
        erros.push('Informe a data da prescrição!');
    } else if (receitaVencida(tipo, data, hoje)) {
        erros.push(`Receita vencida! A validade é de ${tipo === 5 ? 10 : 30} dias a partir da prescrição.`);
    }

    if (tipo !== 5 && !texto(r.numero)) erros.push('Informe o número da notificação/receita!');

    const uso = Number(r.uso);
    if (uso !== 1 && uso !== 2) erros.push('Informe o uso do medicamento (humano ou veterinário)!');

    // Prescritor (D-25)
    const p = r.prescritor ?? {};
    if (!texto(p.nome) || !texto(p.numero)) erros.push('Informe nome e número de registro do prescritor!');
    const conselho = texto(p.conselho).toUpperCase();
    if (!conselhosPermitidos(classe, uso === 2 ? 2 : 1).includes(conselho)) {
        erros.push(`Conselho do prescritor não aceito para este medicamento: ${conselho || '—'}!`);
    }
    if (!UFS.includes(texto(p.uf).toUpperCase())) erros.push('UF do conselho do prescritor inválida!');

    // Comprador obrigatório em controlado; paciente obrigatório em antimicrobiano (Guia §4.2, regras 2 e 3)
    if (classe === 'CONTROLADO') {
        const c = r.comprador;
        if (!c || !texto(c.nome) || !texto(c.documento) || !texto(c.orgaoExpedidor)) {
            erros.push('Dados do comprador obrigatórios para medicamento controlado (nome, documento e órgão expedidor)!');
        } else {
            if (!TIPOS_DOCUMENTO.includes(Number(c.tipoDocumento))) erros.push('Tipo de documento do comprador inválido!');
            if (!UFS.includes(texto(c.uf).toUpperCase())) erros.push('UF do documento do comprador inválida!');
        }
    } else {
        const pa = r.paciente;
        if (!pa || !texto(pa.nome) || !Number.isInteger(Number(pa.idade)) || Number(pa.idade) < 0
            || ![1, 2].includes(Number(pa.unidadeIdade)) || ![1, 2].includes(Number(pa.sexo))) {
            erros.push('Dados do paciente obrigatórios para antimicrobiano (nome, idade, unidade da idade e sexo)!');
        }
    }

    // Quantidades: máximo de 999 por item (D-24) e alerta acima do máximo do produto (D-04)
    for (const i of itens) {
        if (i.quantidade > 999) erros.push(`Quantidade de ${i.produto.name} acima do máximo de 999 por item!`);
        const max = i.produto.qtdMaxReceita;
        if (max && i.quantidade > max) {
            alertas.push({ codigo: 'QTD_ACIMA_MAXIMO', produto: i.produto.name, quantidade: i.quantidade, maximo: max });
        }
    }

    return { erros, alertas, tipoReceituario: tipo, classe };
}
