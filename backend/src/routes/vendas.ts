import { Router } from 'express';
import { moduloAtivo } from '../utils/modulos';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { gerarPixQrCode } from '../utils/pix';
import { dadosEmpresa } from '../utils/empresa';
import { autenticar, ehOperadorDeCaixa } from '../middlewares/auth';
import { autorizarDesconto, validarSenhaAdmin } from '../utils/autorizacao';
import { registrarAuditoria } from '../utils/auditoria';
import { resolverPreco } from '../utils/preco';
import { calcularPromocoes } from '../utils/promocoes';
import { obterSetting } from '../utils/settings';
import { criarRecebiveisCartao } from '../utils/cartao';
import { extrairQrCode } from '../nfe/parse';
import { emitirNfce } from '../nfe';
import { obterNfeConfig } from '../nfe/config';

const router = Router();
router.use(autenticar);

const CAMPOS_NFE = {
    nfeStatus: true,
    nfeNumber: true,
    nfceNumber: true,
    nfeSerie: true,
    nfeKey: true,
    nfeProtocol: true,
    nfeEmitidoAt: true,
    nfeXmlEnviado: true
} as const;

async function emitirNfceSeHabilitado(saleId: string): Promise<void> {
    try {
        const cfg = await obterNfeConfig();
        if (cfg.habilitado && moduloAtivo('nfce')) {
            await emitirNfce(saleId);
        }
    } catch {
        // Não bloqueia a venda: a NFC-e pode ser emitida depois pela tela de consultas.
    }
}

async function vendaComNfe(saleId: string) {
    const venda = await prisma.sale.findUnique({ where: { id: saleId }, select: CAMPOS_NFE });
    return serializarNfe(venda);
}

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

// POST /api/vendas - Finaliza uma venda (itens + pagamento), grava no banco e baixa estoque
// Suporta orçamento (orcamento=true → status PENDING, sem baixa de estoque/pagamento)
router.post('/', async (req: any, res: any) => {
    const { itens, pagamento, orcamento, clienteId, naoEmitirNfe } = req.body;
    const ehOrcamento = Boolean(orcamento);

    if (!itens || !Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ erro: "Nenhum item informado!" });
    }

    const metodo = pagamento?.metodo ?? 'MONEY';
    const valorRecebido = Number(pagamento?.valorRecebido ?? 0);
    const parcelas = metodo === 'CREDIT_CARD' ? Math.max(1, Number(pagamento?.parcelas ?? 1)) : 1;
    const empresaInfo = await dadosEmpresa();

    try {
        const result = await prisma.$transaction(async (tx) => {
            const empresa = await tx.company.findUnique({ where: { id: req.operador.companyId } });
            const filial = req.operador.branchId
                ? await tx.branch.findUnique({ where: { id: req.operador.branchId } })
                : await tx.branch.findFirst({ where: { companyId: req.operador.companyId } });
            const operador = await tx.user.findFirst({ where: { id: req.operador.id, isActive: true } });

            if (!empresa || !filial || !operador) {
                throw new Error("Empresa, filial ou operador não configurados no sistema!");
            }

            // O operador de caixa precisa ter a PRÓPRIA registradora aberta (fluxo Ecocentauro)
            const caixa = await tx.cashRegister.findFirst({
                where: {
                    status: 'OPEN',
                    ...(ehOperadorDeCaixa(req) ? { userId: operador.id } : {})
                }
            });
            if (!caixa) {
                throw new Error(ehOperadorDeCaixa(req)
                    ? "Sua registradora não está aberta! Abra o caixa antes de realizar vendas."
                    : "Nenhuma registradora aberta! Abra o caixa antes de realizar vendas.");
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
                const precoUnit = (await resolverPreco(produto.id, variante?.id ?? null, clienteId || null, qtd, precoBase)) ?? precoBase;
                const custoUnit = variante ? Number(variante.costPrice ?? produto.costPrice ?? 0) : Number(produto.costPrice ?? 0);

                // Verifica o estoque (no orçamento apenas confere, não baixa)
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

                if (!ehOrcamento) {
                    await tx.inventory.update({
                        where: { id: estoque.id },
                        data: {
                            quantity: estoque.quantity - qtd,
                            updatedAt: new Date()
                        }
                    });

                    await tx.inventoryMovement.create({
                        data: {
                            id: randomUUID(),
                            inventoryId: estoque.id,
                            type: 'SALE',
                            quantity: -qtd,
                            reason: 'Venda PDV',
                            userId: operador.id,
                            createdAt: new Date()
                        }
                    });
                }

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

            const desconto = Number(pagamento?.desconto ?? 0);
            const erroDesconto = await autorizarDesconto(desconto, pagamento?.senhaAdmin);
            if (erroDesconto) {
                throw new Error(erroDesconto);
            }

            // Promoções: revalidadas no servidor (fonte da verdade) sobre os preços já aplicados
            const promos = await calcularPromocoes(itensVenda.map(iv => ({
                produtoId: iv.productId,
                variantId: iv.variantId,
                quantidade: iv.quantity,
                precoUnit: Number(iv.unitPrice)
            })));
            const descontoPromo = promos.totalDesconto;
            const descontoTotal = desconto + descontoPromo;

            // Cliente selecionado: usado para preço de tabela, crédito e resgate de cashback
            const cliente = clienteId ? await tx.customer.findUnique({
                where: { id: clienteId },
                include: { CashbackBalance: true }
            }) : null;
            if (clienteId && !cliente) {
                throw new Error("Cliente não encontrado!");
            }

            const cashbackResgate = Number(pagamento?.cashbackResgate ?? 0) || 0;
            if (cashbackResgate > 0) {
                if (ehOrcamento) {
                    throw new Error("Não é possível resgatar cashback em orçamentos!");
                }
                if (!cliente) {
                    throw new Error("Selecione um cliente para resgatar cashback!");
                }
                if (!(await validarSenhaAdmin(pagamento?.senhaAdmin ?? ''))) {
                    throw new Error("Resgate de cashback exige a senha do administrador!");
                }
                const saldoCashback = Number(cliente.CashbackBalance?.balance ?? 0);
                if (cashbackResgate > saldoCashback) {
                    throw new Error(`Saldo de cashback insuficiente! Disponível: R$ ${saldoCashback.toFixed(2)}`);
                }
            }

            const total = subtotal - descontoTotal - cashbackResgate;
            if (total <= 0) {
                throw new Error("Valor total da venda deve ser maior que zero!");
            }
            const numeroVenda = (await tx.sale.count()) + 1;

            // Cartão: resolve a operadora (informada ou padrão) e a bandeira
            let operadoraCartao = null;
            let bandeiraCartao = null;
            if ((metodo === 'CREDIT_CARD' || metodo === 'DEBIT_CARD') && !ehOrcamento) {
                const cardOperatorId = pagamento?.cardOperatorId ? String(pagamento.cardOperatorId).trim() : '';
                const cardBrandId = pagamento?.cardBrandId ? String(pagamento.cardBrandId).trim() : '';
                if (cardOperatorId) {
                    operadoraCartao = await tx.cardOperator.findFirst({ where: { id: cardOperatorId, isActive: true } });
                    if (!operadoraCartao) {
                        throw new Error("Operadora de cartão não encontrada!");
                    }
                } else {
                    operadoraCartao = await tx.cardOperator.findFirst({ where: { isActive: true }, orderBy: { name: 'asc' } });
                }
                if (cardBrandId) {
                    bandeiraCartao = await tx.cardBrand.findUnique({ where: { id: cardBrandId } });
                }
            }

            // PIX: gera o payload/QR do cupom para gravar junto com o pagamento
            let pixInfo: { chave: string; payload: string; qrDataUrl: string } | null = null;
            if (metodo === 'PIX' && !ehOrcamento) {
                const chavePix = (empresaInfo.document || '').replace(/\D/g, '').slice(0, 14) || '00000000000000';
                pixInfo = {
                    ...(await gerarPixQrCode({
                        chave: chavePix,
                        nome: empresaInfo.tradeName,
                        cidade: empresaInfo.city || 'SAO PAULO',
                        valor: total,
                        txid: pagamento?.txid ?? `JG${Date.now()}`
                    })),
                    chave: chavePix
                };
            }

            const venda = await tx.sale.create({
                data: {
                    id: randomUUID(),
                    companyId: empresa.id,
                    branchId: filial.id,
                    customerId: clienteId || null,
                    userId: operador.id,
                    status: ehOrcamento ? 'PENDING' : 'COMPLETED',
                    subtotal,
                    discount: descontoTotal,
                    total,
                    notes: descontoPromo > 0
                        ? `PROMO: ${[...new Set(promos.descontos.map(d => d.nome))].join(', ')}`
                        : null,
                    profit: ehOrcamento ? 0 : total - custoTotal,
                    nfceNumber: String(numeroVenda).padStart(6, '0'),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    SaleItem: {
                        create: itensVenda
                    },
                    SalePayment: ehOrcamento ? undefined : {
                        create: {
                            id: randomUUID(),
                            method: metodo,
                            amount: total,
                            installments: parcelas,
                            cardBrand: bandeiraCartao?.name ?? pagamento?.cardBrand ?? null,
                            cardOperatorId: operadoraCartao?.id ?? null,
                            cardBrandId: bandeiraCartao?.id ?? null,
                            pixKey: pixInfo?.chave ?? null,
                            pixQRCode: pixInfo?.payload ?? null,
                            createdAt: new Date()
                        }
                    }
                },
                include: { SaleItem: true, SalePayment: true }
            });

            // Recebíveis de cartão: um por parcela (crédito) ou único (débito)
            let recebiveisLiquido = 0;
            if (operadoraCartao && moduloAtivo('cartoes')) {
                const rec = await criarRecebiveisCartao({
                    tx,
                    companyId: empresa.id,
                    operadoraId: operadoraCartao.id,
                    brandId: bandeiraCartao?.id ?? null,
                    method: metodo === 'CREDIT_CARD' ? 'CREDIT' : 'DEBIT',
                    installments: parcelas,
                    total,
                    saleId: venda.id,
                    dataVenda: new Date(),
                    nfceNumber: String(numeroVenda).padStart(6, '0')
                });
                recebiveisLiquido = rec.totalLiquido;
            }

            const troco = ehOrcamento ? 0 : (metodo === 'MONEY' && valorRecebido > total
                ? Number((valorRecebido - total).toFixed(2))
                : 0);

            // Cashback: baixa o resgate e credita o percentual configurável sobre o total pago
            let cashbackCreditado = 0;
            if (!ehOrcamento && cliente) {
                if (cashbackResgate > 0) {
                    await tx.cashbackBalance.update({
                        where: { customerId: cliente.id },
                        data: {
                            balance: Number(cliente.CashbackBalance?.balance ?? 0) - cashbackResgate,
                            updatedAt: new Date()
                        }
                    });
                    await tx.loyaltyPoint.create({
                        data: {
                            id: randomUUID(),
                            customerId: cliente.id,
                            points: Math.round(-cashbackResgate * 100),
                            type: 'CASHBACK_RESGATE',
                            orderId: venda.id,
                            createdAt: new Date()
                        }
                    });
                }

                const cashbackPct = moduloAtivo('fidelidade') ? (Number(await obterSetting<number>('cashback_percentual', 0)) || 0) : 0;
                if (cashbackPct > 0) {
                    const valorCashback = Number((total * cashbackPct / 100).toFixed(2));
                    if (valorCashback > 0) {
                        const saldo = await tx.cashbackBalance.findUnique({
                            where: { customerId: cliente.id }
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
                                    customerId: cliente.id,
                                    balance: valorCashback,
                                    updatedAt: new Date()
                                }
                            });
                        }
                        await tx.loyaltyPoint.create({
                            data: {
                                id: randomUUID(),
                                customerId: cliente.id,
                                points: Math.round(valorCashback * 100),
                                type: 'CASHBACK_CREDITO',
                                orderId: venda.id,
                                createdAt: new Date()
                            }
                        });
                        cashbackCreditado = valorCashback;
                    }
                }
            }

            registrarAuditoria({
                userId: operador.id,
                action: ehOrcamento ? 'ORCAMENTO_CRIADO' : 'VENDA_REALIZADA',
                entity: 'SALE',
                entityId: venda.id,
                detail: { numero: venda.nfceNumber, total, desconto, descontoPromo, cashbackResgate, cashbackCreditado }
            });

            return { venda, troco, valorRecebido, pixInfo, cashbackResgate, cashbackCreditado, recebiveisLiquido };
        });

        const resposta: any = {
            id: result.venda.id,
            numero: result.venda.nfceNumber,
            status: result.venda.status,
            subtotal: Number(result.venda.subtotal),
            desconto: Number(result.venda.discount),
            total: Number(result.venda.total),
            troco: result.troco,
            valorRecebido: result.valorRecebido,
            pix: result.pixInfo,
            cashbackResgate: Number(result.cashbackResgate ?? 0),
            cashbackCreditado: Number(result.cashbackCreditado ?? 0),
            recebiveisLiquido: Number(result.recebiveisLiquido ?? 0),
            data: result.venda.createdAt
        };
        if (!result.venda.SalePayment || result.venda.SalePayment.length === 0) {
            resposta.pagamento = null;
        } else {
            resposta.pagamento = result.venda.SalePayment[0].method;
            resposta.parcelas = result.venda.SalePayment[0].installments;
        }
        if (!Boolean(naoEmitirNfe)) {
            await emitirNfceSeHabilitado(result.venda.id);
        }
        resposta.nfe = await vendaComNfe(result.venda.id);
        return res.status(201).json(resposta);
    } catch (error: any) {
        return res.status(400).json({ erro: error.message });
    }
});

// POST /api/vendas/:id/efetivar - Converte um orçamento (PENDING) em venda, baixa estoque e grava pagamento
router.post('/:id/efetivar', async (req: any, res: any) => {
    const { id } = req.params;
    const { pagamento } = req.body;

    try {
        const result = await prisma.$transaction(async (tx) => {
            const orcamento = await tx.sale.findFirst({
                where: {
                    id,
                    status: 'PENDING',
                    ...(ehOperadorDeCaixa(req) ? { userId: req.operador.id } : {})
                },
                include: { SaleItem: true }
            });

            if (!orcamento) {
                throw new Error("Orçamento não encontrado ou já efetivado!");
            }

            const filial = await tx.branch.findFirst();
            const operador = await tx.user.findFirst({ where: { id: req.operador.id, isActive: true } });
            if (!filial || !operador) {
                throw new Error("Filial ou operador não configurados!");
            }

            const metodo = pagamento?.metodo ?? 'MONEY';
            const valorRecebido = Number(pagamento?.valorRecebido ?? 0);
            const parcelas = metodo === 'CREDIT_CARD' ? Math.max(1, Number(pagamento?.parcelas ?? 1)) : 1;

            // Cashback ao efetivar: cliente do orçamento pode resgatar saldo (exige senha admin)
            const cashbackResgate = Number(pagamento?.cashbackResgate ?? 0) || 0;
            const clienteEfetivar = orcamento.customerId ? await tx.customer.findUnique({
                where: { id: orcamento.customerId },
                include: { CashbackBalance: true }
            }) : null;
            let totalFinal = Number(orcamento.total);
            if (cashbackResgate > 0) {
                if (!clienteEfetivar) {
                    throw new Error("Selecione um cliente para resgatar cashback!");
                }
                if (!(await validarSenhaAdmin(pagamento?.senhaAdmin ?? ''))) {
                    throw new Error("Resgate de cashback exige a senha do administrador!");
                }
                const saldo = Number(clienteEfetivar.CashbackBalance?.balance ?? 0);
                if (cashbackResgate > saldo) {
                    throw new Error(`Saldo de cashback insuficiente! Disponível: R$ ${saldo.toFixed(2)}`);
                }
                if (cashbackResgate >= totalFinal) {
                    throw new Error("Resgate de cashback deve ser menor que o total da venda!");
                }
                totalFinal = Number((totalFinal - cashbackResgate).toFixed(2));
            }

            // Revalida estoque e baixa
            for (const item of orcamento.SaleItem) {
                const estoque = await tx.inventory.findFirst({
                    where: {
                        productId: item.productId,
                        branchId: filial.id,
                        ...(item.variantId ? { variantId: item.variantId } : { variantId: null })
                    }
                });
                if (!estoque || estoque.quantity < item.quantity) {
                    throw new Error(`Estoque insuficiente para efetivar o orçamento!`);
                }
                await tx.inventory.update({
                    where: { id: estoque.id },
                    data: { quantity: estoque.quantity - item.quantity, updatedAt: new Date() }
                });
                await tx.inventoryMovement.create({
                    data: {
                        id: randomUUID(),
                        inventoryId: estoque.id,
                        type: 'SALE',
                        quantity: -item.quantity,
                        reason: 'Orçamento efetivado',
                        userId: operador.id,
                        createdAt: new Date()
                    }
                });
            }

            // Gera PIX se necessário
            const empresaInfo = await dadosEmpresa();
            let pixInfo: { chave: string; payload: string; qrDataUrl: string } | null = null;
            if (metodo === 'PIX') {
                const chavePix = (empresaInfo.document || '').replace(/\D/g, '').slice(0, 14) || '00000000000000';
                pixInfo = {
                    ...(await gerarPixQrCode({
                        chave: chavePix,
                        nome: empresaInfo.tradeName,
                        cidade: empresaInfo.city || 'SAO PAULO',
                        valor: totalFinal,
                        txid: pagamento?.txid ?? `JG${Date.now()}`
                    })),
                    chave: chavePix
                };
            }

            // Cartão: resolve a operadora (informada ou padrão) e a bandeira
            let operadoraCartao = null;
            let bandeiraCartao = null;
            if (metodo === 'CREDIT_CARD' || metodo === 'DEBIT_CARD') {
                const cardOperatorId = pagamento?.cardOperatorId ? String(pagamento.cardOperatorId).trim() : '';
                const cardBrandId = pagamento?.cardBrandId ? String(pagamento.cardBrandId).trim() : '';
                if (cardOperatorId) {
                    operadoraCartao = await tx.cardOperator.findFirst({ where: { id: cardOperatorId, isActive: true } });
                    if (!operadoraCartao) {
                        throw new Error("Operadora de cartão não encontrada!");
                    }
                } else {
                    operadoraCartao = await tx.cardOperator.findFirst({ where: { isActive: true }, orderBy: { name: 'asc' } });
                }
                if (cardBrandId) {
                    bandeiraCartao = await tx.cardBrand.findUnique({ where: { id: cardBrandId } });
                }
            }

            const venda = await tx.sale.update({
                where: { id },
                data: {
                    status: 'COMPLETED',
                    total: totalFinal,
                    profit: totalFinal - Number(orcamento.subtotal) + Number(orcamento.discount),
                    updatedAt: new Date(),
                    SalePayment: {
                        create: {
                            id: randomUUID(),
                            method: metodo,
                            amount: totalFinal,
                            installments: parcelas,
                            cardBrand: bandeiraCartao?.name ?? pagamento?.cardBrand ?? (metodo === 'CREDIT_CARD' ? 'CREDITO' : null),
                            cardOperatorId: operadoraCartao?.id ?? null,
                            cardBrandId: bandeiraCartao?.id ?? null,
                            pixKey: pixInfo?.chave ?? null,
                            pixQRCode: pixInfo?.payload ?? null,
                            createdAt: new Date()
                        }
                    }
                },
                include: { SalePayment: true }
            });

            const numeroVenda = venda.nfceNumber ?? (await tx.sale.count()) + 1;

            const troco = metodo === 'MONEY' && valorRecebido > totalFinal
                ? Number((valorRecebido - totalFinal).toFixed(2))
                : 0;

            // Recebíveis de cartão: um por parcela (crédito) ou único (débito)
            let recebiveisLiquido = 0;
            if (operadoraCartao && moduloAtivo('cartoes')) {
                const empresaEfetivar = await tx.company.findFirst();
                if (!empresaEfetivar) {
                    throw new Error("Empresa não configurada!");
                }
                const rec = await criarRecebiveisCartao({
                    tx,
                    companyId: empresaEfetivar.id,
                    operadoraId: operadoraCartao.id,
                    brandId: bandeiraCartao?.id ?? null,
                    method: metodo === 'CREDIT_CARD' ? 'CREDIT' : 'DEBIT',
                    installments: parcelas,
                    total: totalFinal,
                    saleId: venda.id,
                    dataVenda: new Date(),
                    nfceNumber: String(numeroVenda).padStart(6, '0')
                });
                recebiveisLiquido = rec.totalLiquido;
            }

            // Cashback: baixa o resgate e credita o percentual configurável sobre o total pago
            let cashbackCreditado = 0;
            if (clienteEfetivar) {
                if (cashbackResgate > 0) {
                    await tx.cashbackBalance.update({
                        where: { customerId: clienteEfetivar.id },
                        data: {
                            balance: Number(clienteEfetivar.CashbackBalance?.balance ?? 0) - cashbackResgate,
                            updatedAt: new Date()
                        }
                    });
                    await tx.loyaltyPoint.create({
                        data: {
                            id: randomUUID(),
                            customerId: clienteEfetivar.id,
                            points: Math.round(-cashbackResgate * 100),
                            type: 'CASHBACK_RESGATE',
                            orderId: venda.id,
                            createdAt: new Date()
                        }
                    });
                }

                const cashbackPct = moduloAtivo('fidelidade') ? (Number(await obterSetting<number>('cashback_percentual', 0)) || 0) : 0;
                if (cashbackPct > 0) {
                    const valorCashback = Number((totalFinal * cashbackPct / 100).toFixed(2));
                    if (valorCashback > 0) {
                        const saldo = await tx.cashbackBalance.findUnique({
                            where: { customerId: clienteEfetivar.id }
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
                                    customerId: clienteEfetivar.id,
                                    balance: valorCashback,
                                    updatedAt: new Date()
                                }
                            });
                        }
                        await tx.loyaltyPoint.create({
                            data: {
                                id: randomUUID(),
                                customerId: clienteEfetivar.id,
                                points: Math.round(valorCashback * 100),
                                type: 'CASHBACK_CREDITO',
                                orderId: venda.id,
                                createdAt: new Date()
                            }
                        });
                        cashbackCreditado = valorCashback;
                    }
                }
            }

            registrarAuditoria({
                userId: operador.id,
                action: 'ORCAMENTO_EFETIVADO',
                entity: 'SALE',
                entityId: venda.id,
                detail: { numero: venda.nfceNumber, total: totalFinal, cashbackResgate, cashbackCreditado }
            });

            return { venda, troco, valorRecebido, pixInfo, cashbackResgate, cashbackCreditado, recebiveisLiquido };
        });

        const respostaEfetivar: any = {
            id: result.venda.id,
            numero: result.venda.nfceNumber,
            status: result.venda.status,
            total: Number(result.venda.total),
            troco: result.troco,
            pagamento: result.venda.SalePayment[0].method,
            parcelas: result.venda.SalePayment[0].installments,
            pix: result.pixInfo,
            cashbackResgate: Number(result.cashbackResgate ?? 0),
            cashbackCreditado: Number(result.cashbackCreditado ?? 0),
            recebiveisLiquido: Number(result.recebiveisLiquido ?? 0)
        };
        await emitirNfceSeHabilitado(result.venda.id);
        respostaEfetivar.nfe = await vendaComNfe(result.venda.id);
        return res.json(respostaEfetivar);
    } catch (error: any) {
        return res.status(400).json({ erro: error.message });
    }
});

// POST /api/vendas/:id/cancelar - Cancela venda do mesmo dia (senha admin) e devolve estoque
router.post('/:id/cancelar', async (req: any, res: any) => {
    const { id } = req.params;
    const { senhaAdmin, motivo } = req.body;

    try {
        const venda = await prisma.sale.findFirst({
            where: {
                id,
                status: { in: ['COMPLETED', 'PENDING'] },
                ...(ehOperadorDeCaixa(req) ? { userId: req.operador.id } : {})
            },
            include: { SaleItem: true, SalePayment: true }
        });

        if (!venda) {
            return res.status(404).json({ erro: "Venda não encontrada!" });
        }

        if (!(await validarSenhaAdmin(senhaAdmin ?? ''))) {
            return res.status(401).json({ erro: "Senha de administrador incorreta!" });
        }

        // Somente vendas do dia podem ser canceladas
        const inicioHoje = new Date();
        inicioHoje.setHours(0, 0, 0, 0);
        if (venda.createdAt < inicioHoje) {
            return res.status(400).json({ erro: "Somente vendas do dia podem ser canceladas!" });
        }

        await prisma.$transaction(async (tx) => {
            const filial = await tx.branch.findFirst();

            // Devolve o estoque
            for (const item of venda.SaleItem) {
                const estoque = await tx.inventory.findFirst({
                    where: {
                        productId: item.productId,
                        branchId: filial?.id,
                        ...(item.variantId ? { variantId: item.variantId } : { variantId: null })
                    }
                });
                if (estoque) {
                    await tx.inventory.update({
                        where: { id: estoque.id },
                        data: { quantity: estoque.quantity + item.quantity, updatedAt: new Date() }
                    });
                    await tx.inventoryMovement.create({
                        data: {
                            id: randomUUID(),
                            inventoryId: estoque.id,
                            type: 'RETURN',
                            quantity: item.quantity,
                            reason: `Cancelamento venda ${venda.nfceNumber}${motivo ? ' - ' + motivo : ''}`,
                            userId: req.operador.id,
                            createdAt: new Date()
                        }
                    });
                }
            }

            // Estorna parcelas não pagas do financeiro
            if (venda.SalePayment[0]?.method === 'CREDIARIO') {
                await tx.financialTransaction.updateMany({
                    where: { saleId: venda.id, status: { in: ['PENDING', 'OVERDUE'] } },
                    data: { status: 'CANCELLED', updatedAt: new Date() }
                });
            }

            // Cancela recebíveis de cartão ainda pendentes + contas financeiras vinculadas
            const recebiveisPendentes = await tx.cardReceivable.findMany({
                where: { saleId: venda.id, status: 'PENDING' },
                select: { id: true }
            });
            await tx.cardReceivable.updateMany({
                where: { saleId: venda.id, status: 'PENDING' },
                data: { status: 'CANCELLED', updatedAt: new Date() }
            });
            if (recebiveisPendentes.length > 0) {
                await tx.financialTransaction.updateMany({
                    where: {
                        cardReceivableId: { in: recebiveisPendentes.map(r => r.id) },
                        status: { in: ['PENDING', 'OVERDUE'] }
                    },
                    data: { status: 'CANCELLED', updatedAt: new Date() }
                });
            }

            await tx.sale.update({
                where: { id: venda.id },
                data: {
                    status: 'CANCELLED',
                    notes: motivo ? `${venda.notes ? venda.notes + '\n' : ''}CANCELADO: ${motivo}` : venda.notes,
                    updatedAt: new Date()
                }
            });
        });

        registrarAuditoria({
            userId: req.operador.id,
            action: 'VENDA_CANCELADA',
            entity: 'SALE',
            entityId: venda.id,
            detail: { numero: venda.nfceNumber, motivo }
        });

        return res.json({ ok: true, status: 'CANCELLED' });
    } catch (error: any) {
        return res.status(400).json({ erro: error.message });
    }
});

// GET /api/vendas - Lista vendas recentes (para consulta no cupom)
router.get('/', async (req: any, res: any) => {
    const vendas = await prisma.sale.findMany({
        where: ehOperadorDeCaixa(req) ? { userId: req.operador.id } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { SaleItem: true }
    });

    return res.json(vendas.map(v => ({
        id: v.id,
        numero: v.nfceNumber,
        total: Number(v.total),
        data: v.createdAt,
        itens: v.SaleItem.length
    })));
});

// GET /api/vendas/consulta - Consulta de vendas com filtros (período, método, produto/número)
router.get('/consulta', async (req: any, res: any) => {
    const { de, ate, metodo, busca, status } = req.query;

    const and: any[] = [];
    if (ehOperadorDeCaixa(req)) {
        and.push({ userId: req.operador.id });
    }
    if (status && ['COMPLETED', 'CANCELLED', 'REFUNDED', 'PENDING'].includes(status)) {
        and.push({ status });
    }
    if (de || ate) {
        const range: any = {};
        if (de) range.gte = new Date(`${de}T00:00:00`);
        if (ate) range.lte = new Date(`${ate}T23:59:59`);
        and.push({ createdAt: range });
    }
    if (metodo) {
        and.push({ SalePayment: { some: { method: metodo } } });
    }
    if (busca) {
        const termo = String(busca);
        const produtos = await prisma.product.findMany({
            where: {
                OR: [
                    { name: { contains: termo, mode: 'insensitive' } },
                    { barcode: { contains: termo } },
                    { sku: { contains: termo, mode: 'insensitive' } }
                ]
            },
            select: { id: true }
        });
        const or: any[] = [];
        if (/^\d+$/.test(termo)) {
            or.push({ nfceNumber: { contains: termo } });
        }
        if (produtos.length) {
            or.push({ SaleItem: { some: { productId: { in: produtos.map(p => p.id) } } } });
        }
        if (or.length) and.push({ OR: or });
    }

    const where = and.length ? { AND: and } : {};

    const todas = await prisma.sale.findMany({
        where,
        include: { SalePayment: true }
    });

    const porMetodo: Record<string, number> = {};
    let total = 0;
    for (const v of todas) {
        total += Number(v.total);
        for (const p of v.SalePayment) {
            porMetodo[p.method] = (porMetodo[p.method] ?? 0) + Number(p.amount);
        }
    }

    const vendas = await prisma.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 300,
        include: {
            SalePayment: true,
            User: true,
            Customer: { select: { name: true } },
            SaleItem: { include: { Product: true } }
        }
    });

    return res.json({
        resumo: {
            quantidade: todas.length,
            total: Number(total.toFixed(2)),
            porMetodo: Object.fromEntries(
                Object.entries(porMetodo).map(([k, v]) => [k, Number(v.toFixed(2))])
            )
        },
        vendas: vendas.map(v => ({
            id: v.id,
            numero: v.nfceNumber,
            data: v.createdAt,
            status: v.status,
            total: Number(v.total),
            subtotal: Number(v.subtotal),
            desconto: Number(v.discount),
            qtdItens: v.SaleItem.reduce((s, i) => s + i.quantity, 0),
            itens: v.SaleItem.length,
            metodo: v.SalePayment[0]?.method ?? null,
            parcelas: v.SalePayment[0]?.installments ?? 1,
            operador: v.User.name,
            cliente: v.Customer?.name ?? null,
            nfeStatus: v.nfeStatus ?? 'NONE',
            nfeNumero: v.nfeNumber ?? null,
            itensDetalhe: v.SaleItem.map(i => ({
                codigo: i.Product.barcode ?? i.Product.sku ?? '-',
                nome: i.Product.name,
                quantidade: i.quantity,
                unitario: Number(i.unitPrice),
                subtotal: Number(i.subtotal)
            }))
        }))
    });
});

// GET /api/vendas/:id - Detalhe de uma venda (cupom)
router.get('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const venda = await prisma.sale.findFirst({
        where: {
            id,
            ...(ehOperadorDeCaixa(req) ? { userId: req.operador.id } : {})
        },
        include: {
            SaleItem: { include: { Product: true } },
            SalePayment: true,
            User: true,
            Customer: true
        }
    });

    if (!venda) {
        return res.status(404).json({ erro: "Venda não encontrada!" });
    }

    return res.json({
        id: venda.id,
        numero: venda.nfceNumber,
        data: venda.createdAt,
        status: venda.status,
        subtotal: Number(venda.subtotal),
        desconto: Number(venda.discount),
        total: Number(venda.total),
        operador: venda.User.name,
        cliente: venda.Customer?.name ?? null,
        itens: venda.SaleItem.map(i => ({
            codigo: i.Product.barcode ?? i.Product.sku ?? '-',
            nome: i.Product.name,
            quantidade: i.quantity,
            unitario: Number(i.unitPrice),
            subtotal: Number(i.subtotal)
        })),
        pagamento: venda.SalePayment.map(p => ({
            metodo: p.method,
            valor: Number(p.amount),
            parcelas: p.installments,
            bandeira: p.cardBrand
        })),
        nfe: serializarNfe(venda)
    });
});

export default router;
