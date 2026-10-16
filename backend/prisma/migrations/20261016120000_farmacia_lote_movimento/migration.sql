-- CreateTable
CREATE TABLE "LoteMovimento" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidade" DECIMAL(10,3) NOT NULL,
    "saleId" TEXT,
    "saleItemId" TEXT,
    "origemId" TEXT,
    "referencia" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoteMovimento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoteMovimento_loteId_idx" ON "LoteMovimento"("loteId");

-- CreateIndex
CREATE INDEX "LoteMovimento_saleId_idx" ON "LoteMovimento"("saleId");

-- CreateIndex
CREATE INDEX "LoteMovimento_origemId_idx" ON "LoteMovimento"("origemId");

-- AddForeignKey
ALTER TABLE "LoteMovimento" ADD CONSTRAINT "LoteMovimento_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoteMovimento" ADD CONSTRAINT "LoteMovimento_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Saldo inicial (D-20): os lotes que já existem ganham uma linha de abertura no livro-razão,
-- para que a soma das linhas de cada lote seja igual ao saldo gravado em "Lote"."quantidade".
INSERT INTO "LoteMovimento" ("id", "companyId", "loteId", "tipo", "quantidade", "referencia", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text || "id"), "companyId", "id", 'SALDO_INICIAL', "quantidade", 'Saldo existente na criação do livro-razão', CURRENT_TIMESTAMP
FROM "Lote"
WHERE "quantidade" <> 0;
