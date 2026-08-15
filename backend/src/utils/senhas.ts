import { obterSetting } from './settings';

// Valida a senha conforme a política configurada em Configurações > Segurança.
// Retorna uma mensagem de erro ou null se a senha estiver OK.
export const validarPoliticaSenha = async (senha: string): Promise<string | null> => {
    const minimo = Number(await obterSetting<number>('seg_senha_minimo', 8)) || 8;
    const exigeNumero = Boolean(await obterSetting<boolean>('seg_senha_exige_numero', true));
    const exigeMaiuscula = Boolean(await obterSetting<boolean>('seg_senha_exige_maiuscula', true));
    const exigeSimbolo = Boolean(await obterSetting<boolean>('seg_senha_exige_simbolo', false));

    const s = String(senha ?? '');
    const erros: string[] = [];
    if (s.length < minimo) erros.push(`mínimo de ${minimo} caracteres`);
    if (exigeNumero && !/\d/.test(s)) erros.push('pelo menos um número');
    if (exigeMaiuscula && !/[A-Z]/.test(s)) erros.push('pelo menos uma letra maiúscula');
    if (exigeSimbolo && !/[^A-Za-z0-9]/.test(s)) erros.push('pelo menos um símbolo');

    if (erros.length === 0) return null;
    return `A senha deve ter ${erros.join(', ')}.`;
};
