import { PrismaClient } from '@prisma/client';
import { contextoAtual } from './tenant';

// Banco remoto (Supabase): cada consulta tem a latência da rede, então as transações
// da venda/fechamento precisam de mais folga que os 5 s padrão do Prisma.
const base = new PrismaClient({
    transactionOptions: { maxWait: 10_000, timeout: 30_000 }
});

// ---------------------------------------------------------------------------
// Multiempresa: isolamento automático por companyId
// ---------------------------------------------------------------------------

// Tabelas com coluna companyId: filtradas e carimbadas diretamente.
const DIRETAS = new Set([
    'Branch', 'Brand', 'CashRegister', 'Category', 'Collection', 'CardBrand', 'CardOperator',
    'CardReceivable', 'CardStatementImport', 'Customer', 'Employee', 'FinancialTransaction',
    'LoginAudit', 'Product', 'Purchase', 'Sale', 'Setting', 'Supplier', 'InventoryCount',
    'PriceTable', 'Promotion', 'User'
]);

// Tabelas filhas (sem companyId): filtradas pela tabela-mãe.
const PELA_MAE: Record<string, (id: string) => object> = {
    AuditLog: (id) => ({ User: { companyId: id } }),
    CashMovement: (id) => ({ CashRegister: { companyId: id } }),
    CashbackBalance: (id) => ({ Customer: { companyId: id } }),
    CardOperatorFee: (id) => ({ CardOperator: { companyId: id } }),
    CardStatementLine: (id) => ({ CardStatementImport: { companyId: id } }),
    CreditScore: (id) => ({ Customer: { companyId: id } }),
    Inventory: (id) => ({ Branch: { companyId: id } }),
    InventoryMovement: (id) => ({ Inventory: { Branch: { companyId: id } } }),
    LoyaltyPoint: (id) => ({ Customer: { companyId: id } }),
    ProductVariant: (id) => ({ Product: { companyId: id } }),
    PurchaseItem: (id) => ({ Purchase: { companyId: id } }),
    NfeEvent: (id) => ({ Sale: { companyId: id } }),
    SaleInstallment: (id) => ({ Sale: { companyId: id } }),
    SaleItem: (id) => ({ Sale: { companyId: id } }),
    SalePayment: (id) => ({ Sale: { companyId: id } }),
    InventoryCountItem: (id) => ({ InventoryCount: { companyId: id } }),
    PriceTableItem: (id) => ({ PriceTable: { companyId: id } }),
    PromotionProduct: (id) => ({ Promotion: { companyId: id } }),
    Company: (id) => ({ id })
};

// Tabelas da plataforma (painel SaaS): nunca filtradas, só acessíveis como sistema.
const PLATAFORMA = new Set(['PlatformSetting', 'SaasCobranca', 'SaasNota']);

const COM_WHERE = new Set([
    'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
    'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'updateManyAndReturn',
    'delete', 'deleteMany', 'upsert'
]);

const comoLista = (v: any) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function filtroDe(model: string, companyId: string): object | null {
    if (DIRETAS.has(model)) return { companyId };
    const f = PELA_MAE[model];
    return f ? f(companyId) : null;
}

// Garante companyId nos registros criados (e impede criar em outra empresa).
function carimbar(model: string, dados: any, companyId: string) {
    if (!DIRETAS.has(model) || !dados || typeof dados !== 'object') return dados;
    if (dados.Company) return dados; // usa a relação aninhada (connect) — não mistura formatos
    if (dados.companyId !== undefined && dados.companyId !== null && dados.companyId !== companyId) {
        throw new Error(`[multiempresa] tentativa de gravar ${model} em outra empresa.`);
    }
    return { ...dados, companyId };
}

const prisma = base.$extends({
    name: 'multiempresa',
    query: {
        $allModels: {
            async $allOperations({ model, operation, args, query }) {
                const ctx = contextoAtual();
                if (ctx?.sistema) return query(args);

                if (PLATAFORMA.has(model)) {
                    throw new Error(`[multiempresa] ${model} só pode ser acessado pelo sistema.`);
                }
                const companyId = ctx?.companyId;
                if (!companyId) {
                    throw new Error(`[multiempresa] consulta sem empresa definida (${model}.${operation}).`);
                }
                if (model === 'Company' && (operation === 'create' || operation === 'createMany' || operation === 'delete' || operation === 'deleteMany')) {
                    throw new Error('[multiempresa] empresas só podem ser criadas/removidas pelo painel.');
                }

                const a: any = { ...(args as any) };
                const filtro = filtroDe(model, companyId);

                if (filtro && COM_WHERE.has(operation)) {
                    a.where = { ...(a.where ?? {}), AND: [...comoLista(a.where?.AND), filtro] };
                }
                if (operation === 'create') a.data = carimbar(model, a.data, companyId);
                if (operation === 'upsert') a.create = carimbar(model, a.create, companyId);
                if (operation === 'createMany' || operation === 'createManyAndReturn') {
                    a.data = comoLista(a.data).map((d: any) => carimbar(model, d, companyId));
                }
                return query(a);
            }
        }
    }
});

export type ClientePrisma = typeof prisma;
export default prisma;
