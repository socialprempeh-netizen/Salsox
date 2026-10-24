-- Affiliate commission ledger: one row per payment a referred customer made
-- inside their commission window (AFFILIATE_COMMISSION in
-- src/lib/affiliates.ts). Additive: one new table.

-- CreateTable
CREATE TABLE "AffiliateCommission" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "customerId" TEXT,
    "sourceId" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "amount" INTEGER NOT NULL,
    "commission" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "paidOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCommission_sourceId_key" ON "AffiliateCommission"("sourceId");

-- CreateIndex
CREATE INDEX "AffiliateCommission_affiliateId_paidAt_idx" ON "AffiliateCommission"("affiliateId", "paidAt");

-- CreateIndex
CREATE INDEX "AffiliateCommission_customerId_paidAt_idx" ON "AffiliateCommission"("customerId", "paidAt");

-- CreateIndex
CREATE INDEX "AffiliateCommission_paymentIntentId_idx" ON "AffiliateCommission"("paymentIntentId");

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

