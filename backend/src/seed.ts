// Seed: cadastra categorias, marca e produtos de teste com estoque
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const EMPRESA_ID = '02c0aecd-cc39-4378-8a1f-4df2ac174d98';
const FILIAL_ID = '11111111-1111-1111-1111-111111111111';

const categorias = ['ALIMENTOS', 'BEBIDAS', 'HIGIENE', 'LIMPEZA'];

const produtos = [
    { nome: 'CAFÉ TRADICIONAL 500G', codigo: '7891000000015', sku: 'CAF001', preco: 18.90, custo: 13.20, cat: 'ALIMENTOS', estoque: 80 },
    { nome: 'ARROZ TIPO 1 5KG', codigo: '7891000000022', sku: 'ARZ001', preco: 29.90, custo: 21.00, cat: 'ALIMENTOS', estoque: 60 },
    { nome: 'FEIJÃO CARIOCA 1KG', codigo: '7891000000039', sku: 'FEJ001', preco: 9.49, custo: 6.50, cat: 'ALIMENTOS', estoque: 100 },
    { nome: 'REFRIGERANTE COLA 2L', codigo: '7891000000046', sku: 'REF001', preco: 8.99, custo: 5.90, cat: 'BEBIDAS', estoque: 90 },
    { nome: 'SUCO DE LARANJA 1L', codigo: '7891000000053', sku: 'SUC001', preco: 6.50, custo: 4.10, cat: 'BEBIDAS', estoque: 70 },
    { nome: 'ÁGUA MINERAL 500ML', codigo: '7891000000060', sku: 'AGU001', preco: 2.20, custo: 1.20, cat: 'BEBIDAS', estoque: 150 },
    { nome: 'SABONETE 90G', codigo: '7891000000077', sku: 'SAB001', preco: 3.15, custo: 1.90, cat: 'HIGIENE', estoque: 120 },
    { nome: 'SHAMPOO 400ML', codigo: '7891000000084', sku: 'SHA001', preco: 22.90, custo: 15.00, cat: 'HIGIENE', estoque: 40 },
    { nome: 'PAPEL HIGIÊNICO 12 ROLOS', codigo: '7891000000091', sku: 'PHP001', preco: 24.90, custo: 16.50, cat: 'HIGIENE', estoque: 55 },
    { nome: 'DETERGENTE 500ML', codigo: '7891000000107', sku: 'DET001', preco: 2.89, custo: 1.70, cat: 'LIMPEZA', estoque: 110 },
];

async function main() {
    const catIds: Record<string, string> = {};

    for (const nome of categorias) {
        const cat = await prisma.category.upsert({
            where: { id: nome },
            create: {
                id: nome,
                companyId: EMPRESA_ID,
                name: nome,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            },
            update: { updatedAt: new Date() }
        });
        catIds[nome] = cat.id;
    }

    const marca = await prisma.brand.upsert({
        where: { id: 'MARCA-TESTE' },
        create: {
            id: 'MARCA-TESTE',
            companyId: EMPRESA_ID,
            name: 'TESTE',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        },
        update: { updatedAt: new Date() }
    });

    let criados = 0;
    let atualizados = 0;

    for (const p of produtos) {
        const existente = await prisma.product.findFirst({
            where: { barcode: p.codigo }
        });

        const produto = await prisma.product.upsert({
            where: { id: existente?.id ?? randomUUID() },
            create: {
                id: randomUUID(),
                companyId: EMPRESA_ID,
                name: p.nome,
                barcode: p.codigo,
                sku: p.sku,
                categoryId: catIds[p.cat],
                brandId: marca.id,
                costPrice: p.custo,
                salePrice: p.preco,
                profitMargin: Number(((p.preco - p.custo) / p.preco * 100).toFixed(2)),
                unit: 'UN',
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            },
            update: {
                name: p.nome,
                salePrice: p.preco,
                costPrice: p.custo,
                updatedAt: new Date()
            }
        });

        const estoqueExistente = await prisma.inventory.findFirst({
            where: { productId: produto.id, branchId: FILIAL_ID }
        });

        if (estoqueExistente) {
            await prisma.inventory.update({
                where: { id: estoqueExistente.id },
                data: { quantity: p.estoque, updatedAt: new Date() }
            });
            atualizados++;
        } else {
            await prisma.inventory.create({
                data: {
                    id: randomUUID(),
                    productId: produto.id,
                    branchId: FILIAL_ID,
                    quantity: p.estoque,
                    minQuantity: 5,
                    maxQuantity: 500,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });
            criados++;
        }
    }

    console.log(`✅ Seed concluído: ${produtos.length} produtos (${criados} estoques criados, ${atualizados} atualizados)`);
    console.log('Categorias:', categorias.join(', '));
    console.log('Marca: TESTE');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
