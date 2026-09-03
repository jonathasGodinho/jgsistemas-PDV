import { Router } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../db';
import { autenticar, requerPermissao } from '../middlewares/auth';
import { validarSenhaAdmin } from '../utils/autorizacao';
import { registrarAuditoria } from '../utils/auditoria';
import { resolverPreco } from '../utils/preco';
import { calcularPromocoes } from '../utils/promocoes';

const router = Router();
router.use(autenticar, requerPermissao('ADMIN', 'MANAGER', 'SUPERVISOR'));

const buscarProdutoOuVariante = async (tx: any, codigo: string) => {
    const variante = await tx.productVariant.findFirst({
        where: { OR: [{ barcode: codigo }, { sku: codigo }] },
        include: { Product: true }
    });
    if (variante) return { variante, produto: variante.Product };
    const produto = await tx.product.findFirst({
        where: { OR: [{ barcode: codigo }, { sku: codigo }] }
    });
    return produto ? { variante: null, produto } : null;
};

// POST /api/trocas - Registra troca/devolução de uma venda (exige senha admin)
// Body: { vendaId, senhaAdmin, itensDevolvidos: [{codigo, quantidade}], itensNovos: [{codigo, quantidade}], pagamento: {metodo, valorRecebido} }
router.post('/', async (req: any, res: any) => {
    const { vendaId, senhaAdmin, itensDevolvidos, itensNovos, pagamento } = req.body;

    if (!vendaId) {
        return res.status(400).json({ erro: "Informe a venda original!" });
    }
    if (!itensDevolvidos || !Array.isArray(itensDevolvidos) || itensDevolvidos.length === 0) {
        return res.status(400).json({ erro: "Informe ao menos um item devolvido!" });
    }
    if (!(await validarSenhaAdmin(senhaAdmin ?? ''))) {
        return res.status(401).json({ erro: "Senha de administrador incorreta!" });
    }

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

            const venda = await tx.sale.findFirst({
                where: { id: vendaId, status: 'COMPLETED' },
                include: { SaleItem: true, Customer: true }
            });
            if (!venda) {
                throw new Error("Venda original não encontrada ou não está concluída!");
            }

            // Quantidades vendidas por produto/variante
            const vendidos = new Map<string, number>();
            for (const si of venda.SaleItem) {
                const k = `${si.productId}|${si.variantId ?? ''}`;
                vendidos.set(k, (vendidos.get(k) ?? 0) + si.quantity);
            }

            // Valida devoluções e calcula valor devolvido (proporcional ao total pago)
            const fator = Number(venda.subtotal) > 0 ? Number(venda.total) / Number(venda.subtotal) : 1;
            let valorDevolvido = 0;
            const aDevolver: any[] = [];

            for (const item of itensDevolvidos) {
                const qtd = Math.round(Number(item.quantidade) || 0);
                if (qtd <= 0) continue;

                const encontrado = await buscarProdutoOuVariante(tx, String(item.codigo));
                if (!encontrado) {
                    throw new Error(`Produto não encontrado: ${item.codigo}`);
                }
                const k = `${encontrado.produto.id}|${encontrado.variante?.id ?? ''}`;
                const disponivel = vendidos.get(k) ?? 0;
                if (qtd > disponivel) {
                    throw new Error(`Quantidade devolvida excede a compra original: ${encontrado.produto.name}`);
                }

                const saleItem = venda.SaleItem.find(
                    si => si.productId === encontrado.produto.id && (si.variantId ?? '') === (encontrado.variante?.id ?? '')
                );
                valorDevolvido += Number(saleItem?.unitPrice ?? 0) * qtd;
                aDevolver.push({ produto: encontrado.produto, variante: encontrado.variante, quantidade: qtd });
            }

            const valorLiquidoDevolvido = Number((valorDevolvido * fator).toFixed(2));

            // Nova venda (itens novos) com preço pela tabela do cliente e promoções revalidadas
            const itensNovosArr = Array.isArray(itensNovos) ? itensNovos : [];
            const itensVenda: any[] = [];
            let subtotalNovo = 0;
            let custoNovo = 0;

            for (const item of itensNovosArr) {
                const qtd = Math.round(Number(item.quantidade) || 1);
                const encontrado = await buscarProdutoOuVariante(tx, String(item.codigo));
                if (!encontrado) {
                    throw new Error(`Produto não encontrado: ${item.codigo}`);
                }
                const { produto, variante } = encontrado;

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

                const precoBase = variante ? Number(variante.salePrice ?? produto.salePrice) : Number(produto.salePrice);
                const precoUnit = (await resolverPreco(produto.id, variante?.id ?? null, venda.customerId, qtd, precoBase)) ?? precoBase;
                const custoUnit = variante ? Number(variante.costPrice ?? produto.costPrice ?? 0) : Number(produto.costPrice ?? 0);

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
                        reason: `Troca venda ${venda.nfceNumber}`,
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
                    subtotal: precoUnit * qtd,
                    costPrice: custoUnit
                });
                subtotalNovo += precoUnit * qtd;
                custoNovo += custoUnit * qtd;
            }

            // Devolve ao estoque os itens devolvidos
            for (const d of aDevolver) {
                const estoque = await tx.inventory.findFirst({
                    where: {
                        productId: d.produto.id,
                        branchId: filial.id,
                        ...(d.variante ? { variantId: d.variante.id } : { variantId: null })
                    }
                });
                if (estoque) {
                    await tx.inventory.update({
                        where: { id: estoque.id },
                        data: { quantity: estoque.quantity + d.quantidade, updatedAt: new Date() }
                    });
                    await tx.inventoryMovement.create({
                        data: {
                            id: randomUUID(),
                            inventoryId: estoque.id,
                            type: 'RETURN',
                            quantity: d.quantidade,
                            reason: `Devolução troca venda ${venda.nfceNumber}`,
                            userId: operador.id,
                            createdAt: new Date()
                        }
                    });
                }
            }

            const promos = await calcularPromocoes(itensVenda.map(iv => ({
                produtoId: iv.productId,
                variantId: iv.variantId,
                quantidade: iv.quantity,
                precoUnit: Number(iv.unitPrice)
            })));
            const descontoPromo = promos.totalDesconto;
            const totalNovo = Number((subtotalNovo - descontoPromo).toFixed(2));

            const diferenca = Number((totalNovo - valorLiquidoDevolvido).toFixed(2));
            const metodo = pagamento?.metodo ?? 'MONEY';
            const valorRecebido = Number(pagamento?.valorRecebido ?? 0);

            // Nova venda registrada na operação de troca
            const numeroVenda = (await tx.sale.count()) + 1;
            const novaVenda = await tx.sale.create({
                data: {
                    id: randomUUID(),
                    companyId: empresa.id,
                    branchId: filial.id,
                    customerId: venda.customerId,
                    userId: operador.id,
                    status: 'COMPLETED',
                    subtotal: subtotalNovo,
                    discount: descontoPromo,
                    total: totalNovo,
                    profit: totalNovo - custoNovo,
                    notes: `TROCA da venda ${venda.nfceNumber}${descontoPromo > 0 ? ` | PROMO: ${[...new Set(promos.descontos.map(d => d.nome))].join(', ')}` : ''}`,
                    nfceNumber: String(numeroVenda).padStart(6, '0'),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    SaleItem: { create: itensVenda },
                    SalePayment: diferenca > 0 ? {
                        create: {
                            id: randomUUID(),
                            method: metodo,
                            amount: diferenca,
                            installments: 1,
                            createdAt: new Date()
                        }
                    } : undefined
                }
            });

            // Marca a venda original como devolvida e estorna parcelas pendentes
            await tx.sale.update({
                where: { id: venda.id },
                data: { status: 'REFUNDED', updatedAt: new Date() }
            });
            await tx.financialTransaction.updateMany({
                where: { saleId: venda.id, status: { in: ['PENDING', 'OVERDUE'] } },
                data: { status: 'CANCELLED', updatedAt: new Date() }
            });
            await tx.saleInstallment.updateMany({
                where: { saleId: venda.id, status: { in: ['PENDING', 'OVERDUE'] } },
                data: { status: 'CANCELLED' }
            });

            const troco = diferenca >= 0
                ? (metodo === 'MONEY' && valorRecebido > diferenca ? Number((valorRecebido - diferenca).toFixed(2)) : 0)
                : Number((-diferenca).toFixed(2));

            registrarAuditoria({
                userId: operador.id,
                action: 'TROCA_REALIZADA',
                entity: 'SALE',
                entityId: novaVenda.id,
                detail: {
                    vendaOriginal: venda.nfceNumber,
                    valorDevolvido: valorLiquidoDevolvido,
                    valorNovos: totalNovo,
                    diferenca,
                    novaVenda: novaVenda.nfceNumber
                }
            });

            return { novaVenda, valorLiquidoDevolvido, totalNovo, diferenca, troco };
        });

        return res.status(201).json({
            novaVenda: result.novaVenda.nfceNumber,
            valorDevolvido: result.valorLiquidoDevolvido,
            valorNovos: result.totalNovo,
            diferenca: result.diferenca,
            troco: result.troco,
            data: result.novaVenda.createdAt
        });
    } catch (error: any) {
        return res.status(400).json({ erro: error.message });
    }
});

// GET /api/trocas - Lista vendas devolvidas/trocadas
router.get('/', async (_req: any, res: any) => {
    const vendas = await prisma.sale.findMany({
        where: { status: 'REFUNDED' },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { Customer: true, SaleItem: { include: { Product: true } } }
    });

    return res.json(vendas.map(v => ({
        id: v.id,
        numero: v.nfceNumber,
        data: v.createdAt,
        total: Number(v.total),
        cliente: v.Customer?.name ?? null,
        itens: v.SaleItem.map(i => ({
            nome: i.Product.name,
            quantidade: i.quantity,
            unitario: Number(i.unitPrice),
            subtotal: Number(i.subtotal)
        }))
    })));
});

export default router;
