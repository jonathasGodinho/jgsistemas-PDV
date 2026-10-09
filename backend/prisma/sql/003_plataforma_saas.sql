-- Plataforma SaaS: configurações do painel, mensalidades e histórico dos clientes.

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SaasCobranca" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "descricao" TEXT,
    "vencimento" DATE NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "pagoEm" TIMESTAMP(3),
    "valorPago" DECIMAL(10,2),
    "formaPagamento" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaasCobranca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaasNota" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'NOTA',
    "texto" TEXT NOT NULL,
    "autor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaasNota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaasCobranca_status_vencimento_idx" ON "SaasCobranca"("status", "vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "SaasCobranca_companyId_competencia_key" ON "SaasCobranca"("companyId", "competencia");

-- CreateIndex
CREATE INDEX "SaasNota_companyId_createdAt_idx" ON "SaasNota"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "SaasCobranca" ADD CONSTRAINT "SaasCobranca_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaasNota" ADD CONSTRAINT "SaasNota_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Segurança (mesmo padrão de 002_seguranca_rls.sql): só o backend (role postgres) acessa.
ALTER TABLE "PlatformSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaasCobranca" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaasNota" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PlatformSetting", "SaasCobranca", "SaasNota" FROM anon, authenticated;
