// Contexto da empresa (multiempresa / SaaS).
//
// Cada requisição autenticada roda dentro de um contexto com a empresa do operador.
// O cliente Prisma (db.ts) usa esse contexto para filtrar e carimbar `companyId`
// em toda consulta, então uma empresa nunca enxerga dados de outra.
//
// Sem contexto, consultas a dados de empresa FALHAM (em vez de vazar dados).
// Rotinas do sistema que precisam enxergar tudo (login, sessão, painel do
// administrador) rodam explicitamente em `comoSistema(...)`.
import { AsyncLocalStorage } from 'async_hooks';
import type { Contrato } from './utils/contrato';

export type ContextoEmpresa = {
    companyId: string | null;
    sistema: boolean;
    contrato?: Contrato | null;
};

const armazenamento = new AsyncLocalStorage<ContextoEmpresa>();

export function contextoAtual(): ContextoEmpresa | undefined {
    return armazenamento.getStore();
}

export function empresaAtual(): string | null {
    return armazenamento.getStore()?.companyId ?? null;
}

// As consultas do Prisma são "preguiçosas": só executam quando alguém chama .then().
// Por isso o .then() é chamado aqui dentro, enquanto o contexto ainda está ativo.
function executar<T>(ctx: ContextoEmpresa, fn: () => T): T {
    return armazenamento.run(ctx, () => {
        const r: any = fn();
        return (r && typeof r.then === 'function' ? r.then((v: any) => v) : r) as T;
    });
}

// Executa `fn` com os dados limitados à empresa informada.
export function comEmpresa<T>(companyId: string, fn: () => T, contrato?: Contrato | null): T {
    return executar({ companyId, sistema: false, contrato }, fn);
}

// Executa `fn` sem filtro de empresa (uso restrito: login, sessão, painel SaaS).
export function comoSistema<T>(fn: () => T): T {
    return executar({ companyId: null, sistema: true }, fn);
}
