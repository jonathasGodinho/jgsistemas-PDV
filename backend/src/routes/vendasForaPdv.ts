import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { autenticar, ehOperadorDeCaixa } from '../middlewares/auth';
import { autorizarDesconto } from '../utils/autorizacao';
import { obterSetting } from '../utils/settings';
import { registrarAuditoria } from '../utils/auditoria';
import { resolverPreco } from '../utils/preco';
import { calcularPromocoes } from '../utils/promocoes';
import { emitirNfce } from '../nfe';
import { obterNfeConfig } from '../nfe/config';
import { extrairQrCode } from '../nfe/parse';

const router = Router();
router.use(autenticar);

function serializarNfe(venda: any) {
    if (!venda || !venda.nfeStatus || venda.nfeStatus === 'NONE') return null;
    return {
        status: venda.nfeStatus,
        numero: venda.nfeNumber ?? venda.nfceNumber ?? null,
        serie: venda.nfeSerie ?? null,
        chave: venda.nfeKey ?? null,
        protocolo: venda.nfeProtocol ?? null,
        emitidoEm: venda.nfeEmitidoAt ?? null,
        qrCode: extrairQrCode(venda.nfeXmlEnviado) ?? null
    };
}

const somaMes = (data: Date, meses: number): Date => {
    const d = new Date(data);
    const dia = d.getDate();
    d.setMonth(d.getMonth() + meses, 1);
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(dia, ultimo));
    return d;
};

const converterCents = (valor: number) => Math.round(Number(valor) * 100);

// POST /api/vendas-fora-pdv - Registra venda fora do PDV (a prazo/crediário)
router.post('/', async (req: any, res: any) => {
    const { cliente, celular, itens, parcelas, primeiraVencimento, desconto, senhaAdmin, observacoes } = req.body;

    if (!cliente || !String(cliente).trim()) {
        return res.status(400).json({ erro: "Informe o nome do cliente!" });
    }
    if (!itens || !Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ erro: "Nenhum item informado!" });
    }
    const qtdParcelas = Math.max(1, Math.min(24, Math.round(Number(parcelas) || 1)));
    const primeiraData = new Date(`${primeiraVencimento}T00:00:00`);
    if (isNaN(primeiraData.getTime())) {
        return res.status(400).json({ erro: "Informe a data da primeira parcela!" });
    }

    try {
        const descontoNum = Number(desconto ?? 0);
        const cashbackResgate = Number(req.body.cashbackResgate ?? 0) || 0;
        const erroDesconto = await autorizarDesconto(descontoNum, senhaAdmin);
        if (erroDesconto) {
            return res.status(400).json({ erro: erroDesconto });
        }

        const result = await prisma.$transaction(async (tx) => {
            const empresa = await tx.company.findFirst();
            const filial = await tx.branch.findFirst();
            const operador = await tx.user.findFirst({ where: { id: req.operador.id, isActive: true } });

            if (!empresa || !filial || !operador) {
                throw new Error("Empresa, filial ou operador não configurados no sistema!");
            }

            // Cliente: por ID quando selecionado na busca (evita ambiguidade de nomes duplicados);
            // senão reaproveita ou cadastra pelo nome digitado
            const clienteIdInformado = req.body.clienteId ? String(req.body.clienteId).trim() : '';
            let clienteCadastrado = clienteIdInformado
                ? await tx.customer.findUnique({ where: { id: clienteIdInformado } })
                : null;
            if (clienteIdInformado && !clienteCadastrado) {
                throw new Error("Cliente não encontrado!");
            }
            if (!clienteCadastrado) {
                clienteCadastrado = await tx.customer.findFirst({
                    where: { name: { equals: String(cliente).trim(), mode: 'insensitive' } }
                });
            }
            if (!clienteCadastrado) {
                clienteCadastrado = await tx.customer.create({
                    data: {
                        id: randomUUID(),
                        companyId: empresa.id,
                        name: String(cliente).trim(),
                        cellphone: celular ? String(celular).trim() : null,
                        isActive: true,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                });
            } else if (celular && String(celular).trim() && !clienteCadastrado.cellphone) {
                await tx.customer.update({
                    where: { id: clienteCadastrado.id },
                    data: { cellphone: String(celular).trim(), updatedAt: new Date() }
                });
            }

            const itensVenda: any[] = [];
            let subtotal = 0;
            let custoTotal = 0;

            for (const item of itens) {
                const qtd = Math.round(Number(item.quantidade) || 1);

                const variante = await tx.productVariant.findFirst({
                    where: { OR: [{ barcode: item.codigo }, { sku: item.codigo }] },
                    include: { Product: true }
                });

                const produto = variante?.Product ?? await tx.product.findFirst({
                    where: {
                        OR: [{ barcode: item.codigo }, { sku: item.codigo }]
                    }
                });

                if (!produto) {
                    throw new Error(`Produto não encontrado: ${item.codigo}`);
                }

                const precoBase = variante ? Number(variante.salePrice ?? produto.salePrice) : Number(produto.salePrice);
                const precoUnit = (await resolverPreco(produto.id, variante?.id ?? null, clienteCadastrado.id, qtd, precoBase)) ?? precoBase;
                const custoUnit = variante ? Number(variante.costPrice ?? produto.costPrice ?? 0) : Number(produto.costPrice ?? 0);

                const estoque = await tx.inventory.findFirst({
                    where: {
                        productId: produto.id,
                        branchId: filial.id,
                        ...(variante ? { variantId: variante.id } : { variantId: null })
                    }
                });

                if (!estoque || estoque.quantity < qtd) {
                    throw new Error(`Estoque insuficiente para: ${produto.name}`);
                }

                const valorItem = precoUnit * qtd;
                const custoItem = custoUnit * qtd;
                subtotal += valorItem;
                custoTotal += custoItem;

                await tx.inventory.update({
                    where: { id: estoque.id },
                    data: { quantity: estoque.quantity - qtd, updatedAt: new Date() }
                });

                await tx.inventoryMovement.create({
                    data: {
                        id: randomUUID(),
                        inventoryId: estoque.id,
                        type: 'SALE',
                        quantity: -qtd,
                        reason: 'Venda a prazo',
                        userId: operador.id,
                        createdAt: new Date()
                    }
                });

                itensVenda.push({
                    id: randomUUID(),
                    productId: produto.id,
                    variantId: variante?.id ?? null,
                    quantity: qtd,
                    unitPrice: precoUnit,
                    subtotal: valorItem,
                    costPrice: custoUnit
                });
            }

            const total = subtotal - descontoNum - cashbackResgate;
            if (total <= 0) {
                throw new Error("Valor total da venda deve ser maior que zero!");
            }

            // Promoções: revalidadas no servidor sobre os preços já aplicados
            const promos = await calcularPromocoes(itensVenda.map(iv => ({
                produtoId: iv.productId,
                variantId: iv.variantId,
                quantidade: iv.quantity,
                precoUnit: Number(iv.unitPrice)
            })));
            const descontoPromo = promos.totalDesconto;
            const totalFinal = total - descontoPromo;
            if (totalFinal <= 0) {
                throw new Error("Valor total da venda deve ser maior que zero!");
            }

            // Limite de crédito do cliente (creditLimit = 0 significa sem limite)
            const limiteCredito = Number(clienteCadastrado.creditLimit ?? 0);
            if (limiteCredito > 0) {
                const emAberto = await tx.saleInstallment.findMany({
                    where: {
                        Sale: { customerId: clienteCadastrado.id },
                        status: { in: ['PENDING', 'OVERDUE'] }
                    },
                    select: { amount: true }
                });
                const saldoEmUso = emAberto.reduce((s, p) => s + Number(p.amount), 0);
                const bloqueia = await obterSetting<boolean>('bloquear_crediario_limite', true);
                if (saldoEmUso + totalFinal > limiteCredito) {
                    const excedente = Number((saldoEmUso + totalFinal - limiteCredito).toFixed(2));
                    if (bloqueia) {
                        throw new Error(`Limite de crédito excedido para ${clienteCadastrado.name}! Excedente: R$ ${excedente.toFixed(2)}`);
                    }
                }
            }

            const numeroVenda = (await tx.sale.count()) + 1;

            // Valida o resgate de cashback contra o saldo do cliente
            let saldoCashback = 0;
            if (cashbackResgate > 0) {
                const cb = await tx.cashbackBalance.findUnique({
                    where: { customerId: clienteCadastrado.id }
                });
                saldoCashback = Number(cb?.balance ?? 0);
                if (cashbackResgate > saldoCashback) {
                    throw new Error(`Saldo de cashback insuficiente! Disponível: R$ ${saldoCashback.toFixed(2)}`);
                }
            }

            const venda = await tx.sale.create({
                data: {
                    id: randomUUID(),
                    companyId: empresa.id,
                    branchId: filial.id,
                    customerId: clienteCadastrado.id,
                    userId: operador.id,
                    status: 'COMPLETED',
                    subtotal,
                    discount: descontoNum + descontoPromo,
                    total: totalFinal,
                    profit: totalFinal - custoTotal,
                    notes: [observacoes, descontoPromo > 0 ? `PROMO: ${[...new Set(promos.descontos.map(d => d.nome))].join(', ')}` : null]
                        .filter(Boolean)
                        .join('\n') || null,
                    nfceNumber: String(numeroVenda).padStart(6, '0'),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    SaleItem: { create: itensVenda },
                    SalePayment: {
                        create: {
                            id: randomUUID(),
                            method: 'CREDIARIO',
                            amount: totalFinal,
                            installments: qtdParcelas,
                            createdAt: new Date()
                        }
                    }
                }
            });

            // Gera as parcelas com as datas de vencimento e os títulos financeiros
            const totalCents = converterCents(totalFinal);
            const baseCents = Math.floor(totalCents / qtdParcelas);
            let restoCents = totalCents - baseCents * qtdParcelas;
            const hoje = new Date();

            for (let n = 1; n <= qtdParcelas; n++) {
                let valorCents = baseCents;
                if (restoCents > 0) { valorCents += 1; restoCents -= 1; }
                const valorParcela = Number((valorCents / 100).toFixed(2));
                const vencimento = somaMes(primeiraData, n - 1);

                const parcela = await tx.saleInstallment.create({
                    data: {
                        id: randomUUID(),
                        saleId: venda.id,
                        number: n,
                        dueDate: vencimento,
                        amount: valorParcela,
                        status: vencimento < hoje ? 'OVERDUE' : 'PENDING',
                        createdAt: new Date()
                    }
                });

                await tx.financialTransaction.create({
                    data: {
                        id: randomUUID(),
                        companyId: empresa.id,
                        type: 'RECEIVE',
                        status: vencimento < hoje ? 'OVERDUE' : 'PENDING',
                        description: `VENDA A PRAZO - Nº ${String(numeroVenda).padStart(6, '0')} - PARC ${n}/${qtdParcelas} - ${String(cliente).trim().toUpperCase()}`,
                        amount: valorParcela,
                        dueDate: vencimento,
                        category: 'CREDIARIO',
                        saleId: venda.id,
                        notes: `Parcela ${n} de ${qtdParcelas}`,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                });

                void parcela;
            }

            // Fidelidade: aplica resgate de cashback e credita cashback (percentual configurável) ao cliente
            if (cashbackResgate > 0) {
                await tx.cashbackBalance.update({
                    where: { customerId: clienteCadastrado.id },
                    data: { balance: saldoCashback - cashbackResgate, updatedAt: new Date() }
                });
                await tx.loyaltyPoint.create({
                    data: {
                        id: randomUUID(),
                        customerId: clienteCadastrado.id,
                        points: Math.round(-cashbackResgate * 100),
                        type: 'CASHBACK_RESGATE',
                        orderId: venda.id,
                        createdAt: new Date()
                    }
                });
            }

            const cashbackPct = Number(await obterSetting<number>('cashback_percentual', 0)) || 0;
            if (cashbackPct > 0) {
                const valorCashback = Number((totalFinal * cashbackPct / 100).toFixed(2));
                if (valorCashback > 0) {
                    const saldo = await tx.cashbackBalance.findUnique({
                        where: { customerId: clienteCadastrado.id }
                    });
                    if (saldo) {
                        await tx.cashbackBalance.update({
                            where: { id: saldo.id },
                            data: { balance: Number(saldo.balance) + valorCashback, updatedAt: new Date() }
                        });
                    } else {
                        await tx.cashbackBalance.create({
                            data: {
                                id: randomUUID(),
                                customerId: clienteCadastrado.id,
                                balance: valorCashback,
                                updatedAt: new Date()
                            }
                        });
                    }
                    await tx.loyaltyPoint.create({
                        data: {
                            id: randomUUID(),
                            customerId: clienteCadastrado.id,
                            points: Math.round(valorCashback * 100),
                            type: 'CASHBACK_CREDITO',
                            orderId: venda.id,
                            createdAt: new Date()
                        }
                    });
                }
            }

            registrarAuditoria({
                userId: operador.id,
                action: 'VENDA_A_PRAZO_REALIZADA',
                entity: 'SALE',
                entityId: venda.id,
                detail: { numero: venda.nfceNumber, total: totalFinal, desconto: descontoNum, descontoPromo }
            });

            return { venda, cliente: clienteCadastrado };
        });

        const respostaForaPdv: any = {
            id: result.venda.id,
            numero: result.venda.nfceNumber,
            total: Number(result.venda.total),
            subtotal: Number(result.venda.subtotal),
            desconto: Number(result.venda.discount),
            parcelas: qtdParcelas,
            cliente: result.cliente.name,
            data: result.venda.createdAt
        };
        try {
            const cfg = await obterNfeConfig();
            if (cfg.habilitado) {
                await emitirNfce(result.venda.id);
                const comNfe = await prisma.sale.findUnique({
                    where: { id: result.venda.id },
                    select: {
                        nfeStatus: true, nfeNumber: true, nfceNumber: true, nfeSerie: true,
                        nfeKey: true, nfeProtocol: true, nfeEmitidoAt: true, nfeXmlEnviado: true
                    }
                });
                respostaForaPdv.nfe = serializarNfe(comNfe);
            } else {
                respostaForaPdv.nfe = null;
            }
        } catch {
            respostaForaPdv.nfe = null;
        }
        return res.status(201).json(respostaForaPdv);
    } catch (error: any) {
        return res.status(400).json({ erro: error.message });
    }
});

// GET /api/vendas-fora-pdv - Lista vendas fora do PDV (crediário)
router.get('/', async (req: any, res: any) => {
    const vendas = await prisma.sale.findMany({
        where: {
            SalePayment: { some: { method: 'CREDIARIO' } },
            ...(ehOperadorDeCaixa(req) ? { userId: req.operador.id } : {})
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
            Customer: true,
            SalePayment: true,
            SaleInstallment: true,
            SaleItem: { include: { Product: true } }
        }
    });

    return res.json(vendas.map(v => ({
        id: v.id,
        numero: v.nfceNumber,
        data: v.createdAt,
        total: Number(v.total),
        subtotal: Number(v.subtotal),
        desconto: Number(v.discount),
        cliente: v.Customer?.name ?? null,
        celular: v.Customer?.cellphone ?? null,
        operador: v.userId,
        qtdItens: v.SaleItem.reduce((s, i) => s + i.quantity, 0),
        parcelas: v.SaleInstallment.length,
        parcelasPagas: v.SaleInstallment.filter(p => p.status === 'PAID').length,
        status: v.SaleInstallment.every(p => p.status === 'PAID')
            ? 'QUITADO'
            : v.SaleInstallment.some(p => p.status === 'OVERDUE')
                ? 'EM ATRASO'
                : 'EM ABERTO'
    })));
});

// GET /api/vendas-fora-pdv/:id - Detalhe com itens e parcelas (impressão)
router.get('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const venda = await prisma.sale.findFirst({
        where: {
            id,
            ...(ehOperadorDeCaixa(req) ? { userId: req.operador.id } : {})
        },
        include: {
            Customer: true,
            SaleInstallment: { orderBy: { number: 'asc' } },
            SaleItem: { include: { Product: true } },
            User: true
        }
    });

    if (!venda) {
        return res.status(404).json({ erro: "Venda não encontrada!" });
    }

    return res.json({
        id: venda.id,
        numero: venda.nfceNumber,
        data: venda.createdAt,
        subtotal: Number(venda.subtotal),
        desconto: Number(venda.discount),
        total: Number(venda.total),
        cliente: venda.Customer?.name ?? null,
        celular: venda.Customer?.cellphone ?? null,
        operador: venda.User.name,
        observacoes: venda.notes,
        itens: venda.SaleItem.map(i => ({
            codigo: i.Product.barcode ?? i.Product.sku ?? '-',
            nome: i.Product.name,
            quantidade: i.quantity,
            unitario: Number(i.unitPrice),
            subtotal: Number(i.subtotal)
        })),
        parcelas: venda.SaleInstallment.map(p => ({
            id: p.id,
            numero: p.number,
            vencimento: p.dueDate,
            valor: Number(p.amount),
            status: p.status,
            dataPagamento: p.paidDate,
            valorPago: Number(p.paidAmount ?? 0)
        }))
    });
});

// POST /api/vendas-fora-pdv/:id/parcela/:parcelaId/baixar - Baixa uma parcela (recebe o valor)
router.post('/:id/parcela/:parcelaId/baixar', async (req: any, res: any) => {
    const { id, parcelaId } = req.params;

    const parcela = await prisma.saleInstallment.findUnique({ where: { id: parcelaId } });
    if (!parcela) {
        return res.status(404).json({ erro: "Parcela não encontrada!" });
    }

    // Operador de caixa só baixa parcelas das próprias vendas
    if (ehOperadorDeCaixa(req) && parcela.saleId !== id) {
        return res.status(403).json({ erro: "Venda não pertence a este operador!" });
    }
    const vendaDono = await prisma.sale.findUnique({
        where: { id: parcela.saleId },
        select: { userId: true }
    });
    if (ehOperadorDeCaixa(req) && vendaDono?.userId !== req.operador.id) {
        return res.status(403).json({ erro: "Venda não pertence a este operador!" });
    }
    if (parcela.status === 'PAID') {
        return res.status(400).json({ erro: "Parcela já foi baixada!" });
    }

    const atualizada = await prisma.saleInstallment.update({
        where: { id: parcelaId },
        data: {
            status: 'PAID',
            paidDate: new Date(),
            paidAmount: Number(parcela.amount)
        }
    });

    // Sincroniza o título financeiro vinculado à venda (mesma parcela)
    const venda = await prisma.sale.findUnique({
        where: { id: parcela.saleId },
        include: { SalePayment: true }
    });
    const totalParcelas = venda?.SalePayment[0]?.installments ?? 0;
    const titulo = await prisma.financialTransaction.findFirst({
        where: {
            saleId: parcela.saleId,
            notes: `Parcela ${parcela.number} de ${totalParcelas}`,
            status: { in: ['PENDING', 'OVERDUE'] }
        }
    });
    if (titulo) {
        await prisma.financialTransaction.update({
            where: { id: titulo.id },
            data: { status: 'PAID', paidDate: new Date(), paidAmount: Number(parcela.amount), updatedAt: new Date() }
        });
    }

    return res.json({
        id: atualizada.id,
        status: atualizada.status,
        dataPagamento: atualizada.paidDate
    });
});

export default router;
