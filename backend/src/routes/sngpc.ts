// Rotas do SNGPC (farmácia Fase 2) — só o farmacêutico responsável técnico (D-06, RDC 22 art. 18).
// Gera os XML de inventário e de movimentação (zip + MD5, D-02/D-17), guarda o histórico com
// períodos contínuos (D-16) e devolve 422 com as pendências quando faltam dados (D-20).
import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { registrarAuditoria } from '../utils/auditoria';
import { montarInventario, iso } from '../utils/sngpc/inventario';
import { montarMovimentacao } from '../utils/sngpc/movimentacao';
import { empacotar } from '../utils/sngpc/pacote';

const router = Router();
const DIA = 86_400_000;

function dataDoCorpo(v: unknown): Date | null {
    if (!v) return null;
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
}
const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

async function filialDo(req: any) {
    return req.operador.branchId
        ? prisma.branch.findFirst({ where: { id: req.operador.branchId } })
        : prisma.branch.findFirst({ orderBy: { createdAt: 'asc' } });
}

async function gravarArquivo(req: any, filialId: string, tipo: 'INVENTARIO' | 'MOVIMENTACAO', inicio: Date, fim: Date, xml: string) {
    const nome = tipo === 'INVENTARIO' ? `inventario-${iso(fim)}.xml` : `movimentacao-${iso(inicio)}-a-${iso(fim)}.xml`;
    const { zipBase64, hash } = empacotar(xml, nome);
    const arquivo = await prisma.sngpcArquivo.create({
        data: {
            id: randomUUID(), companyId: req.operador.companyId, branchId: filialId, tipo,
            dataInicio: inicio, dataFim: fim, hash, xml, zipBase64, status: 'GERADO', criadoPorId: req.operador.id, createdAt: new Date()
        }
    });
    await registrarAuditoria({
        userId: req.operador.id, action: 'SNGPC_ARQUIVO_GERADO', entity: 'SNGPC_ARQUIVO', entityId: arquivo.id,
        detail: { tipo, dataInicio: iso(inicio), dataFim: iso(fim), hash }
    });
    return { id: arquivo.id, tipo, dataInicio: iso(inicio), dataFim: iso(fim), hash, status: arquivo.status };
}

// POST /api/farmacia/sngpc/inventario { data? } — data até 7 dias atrás (Guia v2.3 p.6)
router.post('/inventario', async (req: any, res: any) => {
    try {
        const data = req.body?.data ? dataDoCorpo(req.body.data) : hoje();
        if (!data) return res.status(400).json({ erro: 'Data do inventário inválida.' });
        const atraso = Math.round((hoje().getTime() - data.getTime()) / DIA);
        if (atraso < 0 || atraso > 7) {
            return res.status(400).json({ erro: 'A data do inventário deve estar entre hoje e 7 dias atrás.' });
        }
        const filial = await filialDo(req);
        if (!filial) return res.status(400).json({ erro: 'Filial não configurada!' });
        const r = await montarInventario(prisma, { filialId: filial.id, data, cpfTransmissor: req.operador.cpf });
        if (!r.xml) return res.status(422).json({ erro: 'Corrija as pendências antes de gerar o inventário.', pendencias: r.pendencias });
        return res.status(201).json(await gravarArquivo(req, filial.id, 'INVENTARIO', data, data, r.xml));
    } catch (e: any) {
        return res.status(400).json({ erro: e.message });
    }
});

// POST /api/farmacia/sngpc/movimentacao { dataInicio? (só no primeiro arquivo), dataFim? }
router.post('/movimentacao', async (req: any, res: any) => {
    try {
        const filial = await filialDo(req);
        if (!filial) return res.status(400).json({ erro: 'Filial não configurada!' });
        const ultimo = await prisma.sngpcArquivo.findFirst({
            where: { branchId: filial.id, tipo: 'MOVIMENTACAO' },
            orderBy: { dataFim: 'desc' }
        });
        // D-16: períodos contínuos — começa no dia seguinte ao fim do último arquivo
        const inicio = ultimo ? new Date(new Date(ultimo.dataFim).getTime() + DIA) : dataDoCorpo(req.body?.dataInicio);
        if (!inicio) return res.status(400).json({ erro: 'Informe a data de início do primeiro arquivo de movimentação.' });
        inicio.setHours(0, 0, 0, 0);
        const fim = req.body?.dataFim ? dataDoCorpo(req.body.dataFim) : hoje();
        if (!fim || fim < inicio || fim > hoje()) {
            return res.status(400).json({ erro: `Data final inválida: deve estar entre ${iso(inicio)} e hoje.` });
        }
        const r = await montarMovimentacao(prisma, { filialId: filial.id, inicio, fim, cpfTransmissor: req.operador.cpf });
        if (!r.xml) return res.status(422).json({ erro: 'Corrija as pendências antes de gerar a movimentação.', pendencias: r.pendencias });
        return res.status(201).json(await gravarArquivo(req, filial.id, 'MOVIMENTACAO', inicio, fim, r.xml));
    } catch (e: any) {
        return res.status(400).json({ erro: e.message });
    }
});

// GET /api/farmacia/sngpc/arquivos — histórico (sem o conteúdo)
router.get('/arquivos', async (_req: any, res: any) => {
    const arquivos = await prisma.sngpcArquivo.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { id: true, tipo: true, dataInicio: true, dataFim: true, hash: true, status: true, createdAt: true, enviadoEm: true, observacao: true }
    });
    return res.json(arquivos.map(a => ({ ...a, dataInicio: iso(a.dataInicio), dataFim: iso(a.dataFim) })));
});

// GET /api/farmacia/sngpc/arquivos/:id/download — o zip para o RT enviar no portal
router.get('/arquivos/:id/download', async (req: any, res: any) => {
    const a = await prisma.sngpcArquivo.findFirst({ where: { id: req.params.id } });
    if (!a) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    const nome = a.tipo === 'INVENTARIO' ? `sngpc-inventario-${iso(a.dataFim)}.zip` : `sngpc-movimentacao-${iso(a.dataInicio)}-a-${iso(a.dataFim)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.setHeader('X-SNGPC-Hash', a.hash);
    return res.send(Buffer.from(a.zipBase64, 'base64'));
});

// GET /api/farmacia/sngpc/painel — prazo de 1 a 7 dias entre transmissões (RDC 22 art. 10 §3º),
// pendências do próximo período e inconsistências abertas (D-16, D-19)
router.get('/painel', async (req: any, res: any) => {
    try {
        const filial = await filialDo(req);
        if (!filial) return res.status(400).json({ erro: 'Filial não configurada!' });
        const ultimo = await prisma.sngpcArquivo.findFirst({
            where: { branchId: filial.id, tipo: 'MOVIMENTACAO' },
            orderBy: { dataFim: 'desc' },
            select: { id: true, tipo: true, dataInicio: true, dataFim: true, hash: true, status: true, createdAt: true }
        });
        const inventario = await prisma.sngpcArquivo.findFirst({
            where: { branchId: filial.id, tipo: 'INVENTARIO' }, orderBy: { dataFim: 'desc' }, select: { id: true, dataFim: true }
        });
        const diasDesdeUltimo = ultimo ? Math.round((hoje().getTime() - new Date(ultimo.dataFim).getTime()) / DIA) : null;
        let pendencias: any[] = [];
        if (ultimo) {
            const inicio = new Date(new Date(ultimo.dataFim).getTime() + DIA);
            if (inicio <= hoje()) {
                pendencias = (await montarMovimentacao(prisma, { filialId: filial.id, inicio, fim: hoje(), cpfTransmissor: req.operador.cpf })).pendencias;
            }
        }
        const inconsistenciasAbertas = await prisma.sngpcInconsistencia.findMany({
            where: { branchId: filial.id, status: 'ABERTA' }, orderBy: { createdAt: 'desc' }
        });
        return res.json({
            ultimoArquivo: ultimo ? { ...ultimo, dataInicio: iso(ultimo.dataInicio), dataFim: iso(ultimo.dataFim) } : null,
            ultimoInventario: inventario ? { id: inventario.id, data: iso(inventario.dataFim) } : null,
            diasDesdeUltimo,
            alertaPrazo: diasDesdeUltimo === null || diasDesdeUltimo > 7,
            pendencias,
            inconsistenciasAbertas
        });
    } catch (e: any) {
        return res.status(400).json({ erro: e.message });
    }
});

// GET /api/farmacia/sngpc/livro?inicio&fim — livro de escrituração por produto e lote (RDC 22 art. 19, II)
router.get('/livro', async (req: any, res: any) => {
    try {
        const filial = await filialDo(req);
        if (!filial) return res.status(400).json({ erro: 'Filial não configurada!' });
        const inicio = dataDoCorpo(req.query.inicio) ?? new Date(hoje().getTime() - 30 * DIA);
        const fim = dataDoCorpo(req.query.fim) ?? hoje();
        const ate = new Date(fim); ate.setHours(23, 59, 59, 999);
        const filtroLote = { branchId: filial.id, Product: { classeSngpc: { not: null } } };
        const movimentos = await prisma.loteMovimento.findMany({
            where: { createdAt: { gte: inicio, lte: ate }, Lote: filtroLote },
            include: { Lote: { include: { Product: true } } },
            orderBy: { createdAt: 'asc' }
        });
        const linhas = movimentos.map(m => ({
            data: m.createdAt,
            tipo: m.tipo,
            produto: m.Lote.Product.name,
            registroMS: m.Lote.Product.registroMS,
            lote: m.Lote.lote,
            quantidade: Number(m.quantidade),
            referencia: m.referencia,
            motivoPerda: m.motivoPerda,
            nfNumero: m.nfNumero
        }));
        // Saldo de cada lote no fim do período = soma do livro-razão até a data final
        const lotes = await prisma.lote.findMany({ where: filtroLote, include: { Product: true }, orderBy: [{ productId: 'asc' }, { validade: 'asc' }] });
        const saldos = [];
        for (const l of lotes) {
            const s = await prisma.loteMovimento.aggregate({ where: { loteId: l.id, createdAt: { lte: ate } }, _sum: { quantidade: true } });
            const saldoFinal = Number(s._sum.quantidade ?? 0);
            if (saldoFinal !== 0 || linhas.some(x => x.lote === l.lote && x.produto === l.Product.name)) {
                saldos.push({ produto: l.Product.name, registroMS: l.Product.registroMS, lote: l.lote, saldoFinal });
            }
        }
        return res.json({ inicio: iso(inicio), fim: iso(fim), linhas, saldos });
    } catch (e: any) {
        return res.status(400).json({ erro: e.message });
    }
});

// POST /api/farmacia/sngpc/arquivos/:id/enviado { observacao? } — o RT confirma o upload no portal
router.post('/arquivos/:id/enviado', async (req: any, res: any) => {
    const a = await prisma.sngpcArquivo.findFirst({ where: { id: req.params.id } });
    if (!a) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    const obs = req.body?.observacao ? String(req.body.observacao).trim().slice(0, 300) : null;
    await prisma.sngpcArquivo.update({
        where: { id: a.id },
        data: { status: 'ENVIADO', enviadoEm: new Date(), enviadoPorId: req.operador.id, observacao: obs }
    });
    await registrarAuditoria({ userId: req.operador.id, action: 'SNGPC_ARQUIVO_ENVIADO', entity: 'SNGPC_ARQUIVO', entityId: a.id, detail: { observacao: obs } });
    return res.json({ ok: true, status: 'ENVIADO' });
});

// POST /api/farmacia/sngpc/inconsistencias/:id/notificada — o RT notificou no portal (RDC 22 art. 14)
router.post('/inconsistencias/:id/notificada', async (req: any, res: any) => {
    const i = await prisma.sngpcInconsistencia.findFirst({ where: { id: req.params.id } });
    if (!i) return res.status(404).json({ erro: 'Inconsistência não encontrada.' });
    await prisma.sngpcInconsistencia.update({
        where: { id: i.id },
        data: { status: 'NOTIFICADA', resolvidaEm: new Date(), resolvidaPorId: req.operador.id }
    });
    await registrarAuditoria({ userId: req.operador.id, action: 'SNGPC_INCONSISTENCIA_NOTIFICADA', entity: 'SNGPC_INCONSISTENCIA', entityId: i.id });
    return res.json({ ok: true, status: 'NOTIFICADA' });
});

export default router;
