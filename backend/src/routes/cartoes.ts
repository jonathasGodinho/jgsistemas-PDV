import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { requerPermissao } from '../middlewares/auth';

const router = Router();

const converterNumero = (v: any) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return isNaN(n) ? null : n;
};

// ==================== OPERADORAS DE CARTÃO ====================

// GET /api/cartoes/operadoras
router.get('/operadoras', async (_req: any, res: any) => {
    const operadoras = await prisma.cardOperator.findMany({
        orderBy: { name: 'asc' },
        include: {
            CardOperatorFee: { include: { CardBrand: true } },
            CardReceivable: { select: { status: true, grossAmount: true } }
        }
    });

    return res.json(operadoras.map(o => ({
        id: o.id,
        nome: o.name,
        diasDebito: o.debitSettlementDays,
        diasCredito: o.creditSettlementDays,
        ativo: o.isActive,
        qtdTaxas: o.CardOperatorFee.length,
        recebiveisPendentes: o.CardReceivable
            .filter(r => r.status === 'PENDING')
            .reduce((s, r) => s + Number(r.grossAmount), 0),
        recebiveisPagos: o.CardReceivable
            .filter(r => r.status === 'PAID' || r.status === 'ANTECIPATED')
            .reduce((s, r) => s + Number(r.grossAmount), 0)
    })));
});

// POST /api/cartoes/operadoras
router.post('/operadoras', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { nome, diasDebito, diasCredito } = req.body;
    if (!nome || !String(nome).trim()) {
        return res.status(400).json({ erro: "Informe o nome da operadora!" });
    }
    const empresa = await prisma.company.findUnique({ where: { id: req.operador.companyId } });
    if (!empresa) {
        return res.status(400).json({ erro: "Empresa não configurada!" });
    }
    const operadora = await prisma.cardOperator.create({
        data: {
            id: randomUUID(),
            companyId: empresa.id,
            name: String(nome).trim().toUpperCase(),
            debitSettlementDays: Math.max(0, Math.round(Number(diasDebito) || 1)),
            creditSettlementDays: Math.max(0, Math.round(Number(diasCredito) || 30)),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        }
    });
    return res.status(201).json({ id: operadora.id, nome: operadora.name });
});

// PUT /api/cartoes/operadoras/:id
router.put('/operadoras/:id', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { id } = req.params;
    const { nome, diasDebito, diasCredito, ativo } = req.body;
    const existente = await prisma.cardOperator.findUnique({ where: { id } });
    if (!existente) {
        return res.status(404).json({ erro: "Operadora não encontrada!" });
    }
    const operadora = await prisma.cardOperator.update({
        where: { id },
        data: {
            name: nome !== undefined ? String(nome).trim().toUpperCase() : existente.name,
            debitSettlementDays: diasDebito !== undefined ? Math.max(0, Math.round(Number(diasDebito) || 1)) : existente.debitSettlementDays,
            creditSettlementDays: diasCredito !== undefined ? Math.max(0, Math.round(Number(diasCredito) || 30)) : existente.creditSettlementDays,
            isActive: ativo !== undefined ? Boolean(ativo) : existente.isActive,
            updatedAt: new Date()
        }
    });
    return res.json({ id: operadora.id, nome: operadora.name });
});

// DELETE /api/cartoes/operadoras/:id
router.delete('/operadoras/:id', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { id } = req.params;
    const comRecebiveis = await prisma.cardReceivable.count({ where: { operatorId: id } });
    if (comRecebiveis > 0) {
        return res.status(400).json({ erro: "Operadora possui recebíveis vinculados!" });
    }
    await prisma.cardOperator.delete({ where: { id } });
    return res.json({ ok: true });
});

// ==================== BANDEIRAS ====================

// GET /api/cartoes/bandeiras
router.get('/bandeiras', async (_req: any, res: any) => {
    const bandeiras = await prisma.cardBrand.findMany({
        orderBy: { name: 'asc' }
    });
    return res.json(bandeiras.map(b => ({
        id: b.id,
        nome: b.name,
        ativo: b.isActive
    })));
});

// POST /api/cartoes/bandeiras
router.post('/bandeiras', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { nome } = req.body;
    if (!nome || !String(nome).trim()) {
        return res.status(400).json({ erro: "Informe o nome da bandeira!" });
    }
    const empresa = await prisma.company.findUnique({ where: { id: req.operador.companyId } });
    if (!empresa) {
        return res.status(400).json({ erro: "Empresa não configurada!" });
    }
    const bandeira = await prisma.cardBrand.create({
        data: {
            id: randomUUID(),
            companyId: empresa.id,
            name: String(nome).trim().toUpperCase(),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        }
    });
    return res.status(201).json({ id: bandeira.id, nome: bandeira.name });
});

// PUT /api/cartoes/bandeiras/:id
router.put('/bandeiras/:id', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { id } = req.params;
    const { nome, ativo } = req.body;
    const existente = await prisma.cardBrand.findUnique({ where: { id } });
    if (!existente) {
        return res.status(404).json({ erro: "Bandeira não encontrada!" });
    }
    const bandeira = await prisma.cardBrand.update({
        where: { id },
        data: {
            name: nome !== undefined ? String(nome).trim().toUpperCase() : existente.name,
            isActive: ativo !== undefined ? Boolean(ativo) : existente.isActive,
            updatedAt: new Date()
        }
    });
    return res.json({ id: bandeira.id, nome: bandeira.name });
});

// DELETE /api/cartoes/bandeiras/:id
router.delete('/bandeiras/:id', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { id } = req.params;
    const usos = await prisma.cardBrand.aggregate({
        _count: { _all: true }
    });
    void usos;
    const emTaxas = await prisma.cardOperatorFee.count({ where: { brandId: id } });
    const emRecebiveis = await prisma.cardReceivable.count({ where: { brandId: id } });
    const emPagamentos = await prisma.salePayment.count({ where: { cardBrandId: id } });
    if (emTaxas + emRecebiveis + emPagamentos > 0) {
        return res.status(400).json({ erro: "Bandeira possui taxas, recebíveis ou pagamentos vinculados!" });
    }
    await prisma.cardBrand.delete({ where: { id } });
    return res.json({ ok: true });
});

// ==================== TAXAS (MDR) ====================

// GET /api/cartoes/taxas?operadoraId=
router.get('/taxas', async (req: any, res: any) => {
    const { operadoraId } = req.query;
    const taxas = await prisma.cardOperatorFee.findMany({
        where: operadoraId ? { operatorId: String(operadoraId) } : undefined,
        orderBy: [{ method: 'asc' }, { installments: 'asc' }],
        include: { CardOperator: true, CardBrand: true }
    });
    return res.json(taxas.map(t => ({
        id: t.id,
        operadoraId: t.operatorId,
        operadora: t.CardOperator.name,
        bandeiraId: t.brandId,
        bandeira: t.CardBrand?.name ?? null,
        metodo: t.method,
        parcelas: t.installments,
        taxa: Number(t.feePercent)
    })));
});

// POST /api/cartoes/taxas - Cria ou atualiza (upsert) uma taxa
router.post('/taxas', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { operadoraId, bandeiraId, metodo, parcelas, taxa } = req.body;
    const metodoCard = metodo === 'DEBIT' ? 'DEBIT' : 'CREDIT';
    const qtdParcelas = Math.max(1, Math.round(Number(parcelas) || 1));
    const taxaNum = converterNumero(taxa);
    if (!operadoraId) {
        return res.status(400).json({ erro: "Informe a operadora!" });
    }
    if (taxaNum === null || taxaNum < 0 || taxaNum > 100) {
        return res.status(400).json({ erro: "Informe um percentual de taxa válido (0 a 100)!" });
    }
    const operadora = await prisma.cardOperator.findUnique({ where: { id: operadoraId } });
    if (!operadora) {
        return res.status(404).json({ erro: "Operadora não encontrada!" });
    }
    if (bandeiraId) {
        const bandeira = await prisma.cardBrand.findUnique({ where: { id: bandeiraId } });
        if (!bandeira) {
            return res.status(404).json({ erro: "Bandeira não encontrada!" });
        }
    }

    const existente = await prisma.cardOperatorFee.findFirst({
        where: {
            operatorId: operadoraId,
            brandId: bandeiraId || null,
            method: metodoCard,
            installments: qtdParcelas
        }
    });
    const taxaReg = existente
        ? await prisma.cardOperatorFee.update({
            where: { id: existente.id },
            data: { feePercent: taxaNum, updatedAt: new Date() }
        })
        : await prisma.cardOperatorFee.create({
            data: {
                id: randomUUID(),
                operatorId: operadoraId,
                brandId: bandeiraId || null,
                method: metodoCard,
                installments: qtdParcelas,
                feePercent: taxaNum,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });

    return res.status(existente ? 200 : 201).json({ id: taxaReg.id, taxa: Number(taxaReg.feePercent) });
});

// DELETE /api/cartoes/taxas/:id
router.delete('/taxas/:id', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'), async (req: any, res: any) => {
    const { id } = req.params;
    const taxas = await prisma.cardOperatorFee.findUnique({ where: { id } });
    if (!taxas) {
        return res.status(404).json({ erro: "Taxa não encontrada!" });
    }
    await prisma.cardOperatorFee.delete({ where: { id } });
    return res.json({ ok: true });
});

// ==================== RECEBÍVEIS ====================

// GET /api/cartoes/recebiveis?status=&operadoraId=&bandeiraId=&de=&ate=
router.get('/recebiveis', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'FINANCIAL'), async (req: any, res: any) => {
    const { status, operadoraId, bandeiraId, de, ate } = req.query;
    const and: any[] = [];
    if (status && ['PENDING', 'ANTECIPATED', 'PAID', 'CANCELLED'].includes(String(status))) {
        and.push({ status: String(status) });
    }
    if (operadoraId) and.push({ operatorId: String(operadoraId) });
    if (bandeiraId) and.push({ brandId: String(bandeiraId) });
    if (de || ate) {
        const range: any = {};
        if (de) range.gte = new Date(`${de}T00:00:00`);
        if (ate) range.lte = new Date(`${ate}T23:59:59`);
        and.push({ expectedDate: range });
    }
    const where = and.length ? { AND: and } : {};

    const todos = await prisma.cardReceivable.findMany({
        where,
        include: {
            CardOperator: true,
            CardBrand: true,
            Sale: { select: { nfceNumber: true } },
            FinancialTransaction: { select: { id: true, status: true, paidDate: true } }
        }
    });

    const resumo = todos.reduce((acc, r) => {
        const bruto = Number(r.grossAmount);
        const taxa = Number(r.feeAmount);
        const liquido = Number(r.netAmount);
        if (r.status === 'PENDING') {
            acc.pendente += liquido;
            acc.brutoPendente += bruto;
            acc.taxaPendente += taxa;
        } else if (r.status === 'ANTECIPATED') {
            acc.antecipado += liquido;
            acc.brutoAntecipado += bruto;
            acc.taxaAntecipada += taxa;
        } else if (r.status === 'PAID') {
            acc.pago += liquido;
            acc.brutoPago += bruto;
            acc.taxaPaga += taxa;
        }
        acc.total += bruto;
        acc.totalTaxa += taxa;
        return acc;
    }, {
        pendente: 0, brutoPendente: 0, taxaPendente: 0,
        antecipado: 0, brutoAntecipado: 0, taxaAntecipada: 0,
        pago: 0, brutoPago: 0, taxaPaga: 0,
        total: 0, totalTaxa: 0, qtd: todos.length
    });

    const recebiveis = [...todos]
        .sort((a, b) => new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime())
        .map(r => ({
            id: r.id,
            operadora: r.CardOperator.name,
            bandeira: r.CardBrand?.name ?? 'Genérica',
            metodo: r.method,
            parcela: `${r.installNumber}/${r.installments}`,
            venda: r.Sale?.nfceNumber ?? null,
            bruto: Number(r.grossAmount),
            taxa: Number(r.feeAmount),
            liquido: Number(r.netAmount),
            vencimento: r.expectedDate,
            status: r.status,
            dataPagamento: r.paidDate,
            dataAntecipacao: r.anticipationDate,
            taxaAntecipacao: Number(r.anticipationFee ?? 0),
            contaFinanceiraId: r.FinancialTransaction?.id ?? null,
            contaFinanceiraStatus: r.FinancialTransaction?.status ?? null
        }));

    const arredondar = (v: number) => Number(v.toFixed(2));
    return res.json({
        resumo: {
            pendente: arredondar(resumo.pendente),
            brutoPendente: arredondar(resumo.brutoPendente),
            taxaPendente: arredondar(resumo.taxaPendente),
            antecipado: arredondar(resumo.antecipado),
            brutoAntecipado: arredondar(resumo.brutoAntecipado),
            taxaAntecipada: arredondar(resumo.taxaAntecipada),
            pago: arredondar(resumo.pago),
            brutoPago: arredondar(resumo.brutoPago),
            taxaPaga: arredondar(resumo.taxaPaga),
            total: arredondar(resumo.total),
            totalTaxa: arredondar(resumo.totalTaxa),
            qtd: resumo.qtd
        },
        recebiveis
    });
});

// Formata uma data no fuso local como YYYY-MM-DD (evita deslocamento do toISOString).
const fmtData = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// GET /api/cartoes/projecao?de=&ate=&operadoraId=&bandeiraId=
// Projeção de repasses D+ dos recebíveis PENDENTES, agrupados por data de vencimento
// e por operadora. Default: de hoje até +90 dias.
router.get('/projecao', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'FINANCIAL'), async (req: any, res: any) => {
    const { de, ate, operadoraId, bandeiraId } = req.query;

    const hoje = new Date();
    const deDate = de ? new Date(`${de}T00:00:00`) : new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const ateDate = ate ? new Date(`${ate}T23:59:59`) : new Date(deDate);
    if (!ate) {
        ateDate.setDate(ateDate.getDate() + 90);
    }

    const and: any[] = [{ status: 'PENDING' }];
    and.push({ expectedDate: { gte: deDate, lte: ateDate } });
    if (operadoraId) and.push({ operatorId: String(operadoraId) });
    if (bandeiraId) and.push({ brandId: String(bandeiraId) });

    const recebiveis = await prisma.cardReceivable.findMany({
        where: { AND: and },
        include: { CardOperator: true }
    });

    const porDataMap = new Map<string, any>();
    for (let d = new Date(deDate.getTime()); d <= ateDate; d.setDate(d.getDate() + 1)) {
        porDataMap.set(fmtData(d), { bruto: 0, taxa: 0, liquido: 0, qtd: 0, porOperadora: {} as Record<string, number> });
    }

    const porOperadoraMap = new Map<string, any>();
    for (const r of recebiveis) {
        const chave = fmtData(new Date(r.expectedDate));
        const dia = porDataMap.get(chave);
        if (!dia) continue;

        const bruto = Number(r.grossAmount);
        const taxa = Number(r.feeAmount);
        const liquido = Number(r.netAmount);

        dia.bruto += bruto;
        dia.taxa += taxa;
        dia.liquido += liquido;
        dia.qtd += 1;
        dia.porOperadora[r.CardOperator.name] = (dia.porOperadora[r.CardOperator.name] ?? 0) + liquido;

        let op = porOperadoraMap.get(r.operatorId);
        if (!op) {
            op = {
                operadoraId: r.operatorId,
                operadora: r.CardOperator.name,
                bruto: 0,
                taxa: 0,
                liquido: 0,
                qtd: 0,
                primeiroVencimento: new Date(r.expectedDate),
                ultimoVencimento: new Date(r.expectedDate)
            };
            porOperadoraMap.set(r.operatorId, op);
        }
        op.bruto += bruto;
        op.taxa += taxa;
        op.liquido += liquido;
        op.qtd += 1;
        if (new Date(r.expectedDate) < op.primeiroVencimento) op.primeiroVencimento = new Date(r.expectedDate);
        if (new Date(r.expectedDate) > op.ultimoVencimento) op.ultimoVencimento = new Date(r.expectedDate);
    }

    const arredondar = (v: number) => Number(v.toFixed(2));

    const porData = [...porDataMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([data, dia]) => ({
            data,
            bruto: arredondar(dia.bruto),
            taxa: arredondar(dia.taxa),
            liquido: arredondar(dia.liquido),
            qtd: dia.qtd,
            porOperadora: Object.entries(dia.porOperadora)
                .map(([operadora, liquido]) => ({ operadora, liquido: arredondar(Number(liquido)) }))
                .sort((a, b) => b.liquido - a.liquido)
        }))
        .filter(d => d.qtd > 0);

    const porOperadora = [...porOperadoraMap.values()]
        .map(op => ({
            operadoraId: op.operadoraId,
            operadora: op.operadora,
            bruto: arredondar(op.bruto),
            taxa: arredondar(op.taxa),
            liquido: arredondar(op.liquido),
            qtd: op.qtd,
            primeiroVencimento: op.primeiroVencimento,
            ultimoVencimento: op.ultimoVencimento
        }))
        .sort((a, b) => b.liquido - a.liquido);

    const resumo = porOperadora.reduce((acc, op) => {
        acc.bruto += op.bruto;
        acc.taxa += op.taxa;
        acc.liquido += op.liquido;
        acc.qtd += op.qtd;
        return acc;
    }, { bruto: 0, taxa: 0, liquido: 0, qtd: 0 });

    return res.json({
        de: fmtData(deDate),
        ate: fmtData(new Date(ateDate.getFullYear(), ateDate.getMonth(), ateDate.getDate())),
        resumo: {
            bruto: arredondar(resumo.bruto),
            taxa: arredondar(resumo.taxa),
            liquido: arredondar(resumo.liquido),
            qtd: resumo.qtd
        },
        porData,
        porOperadora
    });
});

// Cria a "conta a receber" (FinancialTransaction RECEIVE) vinculada a um recebível,
// caso ainda não exista (dados antigos ou importados sem contrapartida).
const garantirContaFinanceira = async (tx: any, recebivel: any, companyId: string, nfceNumber?: string) => {
    const existente = await tx.financialTransaction.findFirst({
        where: { cardReceivableId: recebivel.id }
    });
    if (existente) return existente;

    const operadora = await tx.cardOperator.findUnique({ where: { id: recebivel.operatorId } });
    const descricao = `REPASSE CARTÃO ${operadora?.name?.toUpperCase() ?? ''} - VENDA ${nfceNumber ?? ''}`.trim();
    return tx.financialTransaction.create({
        data: {
            id: randomUUID(),
            companyId,
            type: 'RECEIVE',
            status: recebivel.expectedDate < new Date() ? 'OVERDUE' : 'PENDING',
            description: descricao,
            amount: Number(recebivel.netAmount),
            dueDate: recebivel.expectedDate,
            category: 'CARTÃO',
            saleId: recebivel.saleId,
            cardReceivableId: recebivel.id,
            notes: `${recebivel.method === 'CREDIT' ? 'CRÉDITO' : 'DÉBITO'} - parcela ${recebivel.installNumber}/${recebivel.installments} do repasse`,
            createdAt: new Date(),
            updatedAt: new Date()
        }
    });
};

// POST /api/cartoes/recebiveis/:id/baixar - Recebe a venda na data prevista
router.post('/recebiveis/:id/baixar', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'FINANCIAL'), async (req: any, res: any) => {
    const { id } = req.params;
    const recebivel = await prisma.cardReceivable.findUnique({ where: { id } });
    if (!recebivel) {
        return res.status(404).json({ erro: "Recebível não encontrado!" });
    }
    if (recebivel.status !== 'PENDING') {
        return res.status(400).json({ erro: "Somente recebíveis PENDENTES podem ser baixados!" });
    }
    const atualizado = await prisma.$transaction(async (tx) => {
        const reg = await tx.cardReceivable.update({
            where: { id },
            data: { status: 'PAID', paidDate: new Date(), updatedAt: new Date() }
        });
        const empresa = await tx.company.findFirst();
        const conta = await garantirContaFinanceira(tx, reg, empresa?.id ?? '', undefined);
        await tx.financialTransaction.update({
            where: { id: conta.id },
            data: {
                status: 'PAID',
                paidDate: new Date(),
                paidAmount: Number(reg.netAmount),
                updatedAt: new Date()
            }
        });
        return reg;
    });
    return res.json({ ok: true, status: atualizado.status, liquido: Number(atualizado.netAmount) });
});

// POST /api/cartoes/recebiveis/:id/antecipar - Antecipa o recebível (aplica taxa opcional)
router.post('/recebiveis/:id/antecipar', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'FINANCIAL'), async (req: any, res: any) => {
    const { id } = req.params;
    const { taxa } = req.body;
    const taxaNum = converterNumero(taxa) ?? 0;
    if (!Number.isFinite(taxaNum) || taxaNum < 0 || taxaNum > 100) {
        return res.status(400).json({ erro: "Taxa de antecipação deve estar entre 0 e 100!" });
    }
    const recebivel = await prisma.cardReceivable.findUnique({ where: { id } });
    if (!recebivel) {
        return res.status(404).json({ erro: "Recebível não encontrado!" });
    }
    if (recebivel.status !== 'PENDING') {
        return res.status(400).json({ erro: "Somente recebíveis PENDENTES podem ser antecipados!" });
    }
    const liquido = Number(recebivel.netAmount);
    const valorAntecipado = Number((liquido - (liquido * taxaNum / 100)).toFixed(2));
    const atualizado = await prisma.$transaction(async (tx) => {
        const reg = await tx.cardReceivable.update({
            where: { id },
            data: {
                status: 'ANTECIPATED',
                anticipationDate: new Date(),
                anticipationFee: taxaNum,
                notes: recebivel.notes
                    ? `${recebivel.notes}\nAntecipação: R$ ${valorAntecipado.toFixed(2)}`
                    : `Antecipação: R$ ${valorAntecipado.toFixed(2)}`,
                updatedAt: new Date()
            }
        });
        const empresa = await tx.company.findFirst();
        const conta = await garantirContaFinanceira(tx, reg, empresa?.id ?? '', undefined);
        await tx.financialTransaction.update({
            where: { id: conta.id },
            data: {
                status: 'PAID',
                paidDate: new Date(),
                paidAmount: valorAntecipado,
                notes: conta.notes
                    ? `${conta.notes}\nAntecipado com taxa de ${taxaNum.toFixed(2)}%: crédito de R$ ${valorAntecipado.toFixed(2)}`
                    : `Antecipado com taxa de ${taxaNum.toFixed(2)}%: crédito de R$ ${valorAntecipado.toFixed(2)}`,
                updatedAt: new Date()
            }
        });
        return reg;
    });
    return res.json({ ok: true, status: atualizado.status, valorAntecipado });
});

// POST /api/cartoes/recebiveis/antecipar-pendentes - Antecipa todos os recebíveis pendentes
router.post('/recebiveis/antecipar-pendentes', requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR', 'FINANCIAL'), async (req: any, res: any) => {
    const { taxa, operadoraId } = req.body;
    const taxaNum = converterNumero(taxa) ?? 0;
    if (!Number.isFinite(taxaNum) || taxaNum < 0 || taxaNum > 100) {
        return res.status(400).json({ erro: "Taxa de antecipação deve estar entre 0 e 100!" });
    }
    const where: any = { status: 'PENDING' };
    if (operadoraId) where.operatorId = String(operadoraId);

    const pendentes = await prisma.cardReceivable.findMany({ where });
    if (pendentes.length === 0) {
        return res.status(400).json({ erro: "Nenhum recebível pendente para antecipar!" });
    }

    let valorAntecipado = 0;
    for (const rec of pendentes) {
        const liquido = Number(rec.netAmount);
        const valor = Number((liquido - (liquido * taxaNum / 100)).toFixed(2));
        valorAntecipado += valor;
        await prisma.$transaction(async (tx) => {
            const reg = await tx.cardReceivable.update({
                where: { id: rec.id },
                data: {
                    status: 'ANTECIPATED',
                    anticipationDate: new Date(),
                    anticipationFee: taxaNum,
                    notes: rec.notes
                        ? `${rec.notes}\nAntecipação: R$ ${valor.toFixed(2)}`
                        : `Antecipação: R$ ${valor.toFixed(2)}`,
                    updatedAt: new Date()
                }
            });
            const empresa = await tx.company.findFirst();
            const conta = await garantirContaFinanceira(tx, reg, empresa?.id ?? '', undefined);
            await tx.financialTransaction.update({
                where: { id: conta.id },
                data: {
                    status: 'PAID',
                    paidDate: new Date(),
                    paidAmount: valor,
                    notes: conta.notes
                        ? `${conta.notes}\nAntecipado com taxa de ${taxaNum.toFixed(2)}%: crédito de R$ ${valor.toFixed(2)}`
                        : `Antecipado com taxa de ${taxaNum.toFixed(2)}%: crédito de R$ ${valor.toFixed(2)}`,
                    updatedAt: new Date()
                }
            });
        });
    }

    return res.json({
        ok: true,
        qtd: pendentes.length,
        valorAntecipado: Number(valorAntecipado.toFixed(2))
    });
});

export default router;
