-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "classeSngpc" TEXT,
ADD COLUMN     "listaPortaria344" TEXT,
ADD COLUMN     "qtdMaxReceita" INTEGER,
ADD COLUMN     "unidadeSngpc" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "nfData" TIMESTAMP(3),
ADD COLUMN     "nfNumero" TEXT;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "receitaId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "crf" TEXT,
ADD COLUMN     "crfUf" TEXT,
ADD COLUMN     "farmaceuticoRT" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LoteMovimento" ADD COLUMN     "cnpjOrigem" TEXT,
ADD COLUMN     "motivoPerda" INTEGER,
ADD COLUMN     "nfData" TIMESTAMP(3),
ADD COLUMN     "nfNumero" TEXT;

-- CreateTable
CREATE TABLE "Receita" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "tipoReceituario" INTEGER NOT NULL,
    "numero" TEXT,
    "dataPrescricao" TIMESTAMP(3) NOT NULL,
    "uso" INTEGER NOT NULL,
    "prescritorNome" TEXT NOT NULL,
    "prescritorConselho" TEXT NOT NULL,
    "prescritorNumero" TEXT NOT NULL,
    "prescritorUf" TEXT NOT NULL,
    "compradorNome" TEXT,
    "compradorTipoDoc" INTEGER,
    "compradorDocumento" TEXT,
    "compradorOrgao" TEXT,
    "compradorUf" TEXT,
    "pacienteNome" TEXT,
    "pacienteIdade" INTEGER,
    "pacienteUnidadeIdade" INTEGER,
    "pacienteSexo" INTEGER,
    "pacienteCid" TEXT,
    "quantidadeConfirmada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SngpcArquivo" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "hash" TEXT NOT NULL,
    "xml" TEXT NOT NULL,
    "zipBase64" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GERADO',
    "criadoPorId" TEXT NOT NULL,
    "enviadoEm" TIMESTAMP(3),
    "enviadoPorId" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SngpcArquivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SngpcInconsistencia" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "saleId" TEXT,
    "arquivoId" TEXT,
    "descricao" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvidaEm" TIMESTAMP(3),
    "resolvidaPorId" TEXT,

    CONSTRAINT "SngpcInconsistencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Receita_saleId_idx" ON "Receita"("saleId");

-- CreateIndex
CREATE INDEX "Receita_companyId_compradorDocumento_idx" ON "Receita"("companyId", "compradorDocumento");

-- CreateIndex
CREATE INDEX "SngpcArquivo_companyId_branchId_tipo_dataFim_idx" ON "SngpcArquivo"("companyId", "branchId", "tipo", "dataFim");

-- CreateIndex
CREATE INDEX "SngpcInconsistencia_companyId_status_idx" ON "SngpcInconsistencia"("companyId", "status");

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_receitaId_fkey" FOREIGN KEY ("receitaId") REFERENCES "Receita"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receita" ADD CONSTRAINT "Receita_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receita" ADD CONSTRAINT "Receita_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SngpcArquivo" ADD CONSTRAINT "SngpcArquivo_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SngpcArquivo" ADD CONSTRAINT "SngpcArquivo_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SngpcInconsistencia" ADD CONSTRAINT "SngpcInconsistencia_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SngpcInconsistencia" ADD CONSTRAINT "SngpcInconsistencia_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

