-- AppSumo lifetime licenses (src/lib/appsumo.ts): one row per license key, as
-- AppSumo's licensing webhooks describe it, linked to the account that
-- redeemed it. Additive: one new table and one enum.

-- CreateEnum
CREATE TYPE "AppSumoLicenseStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'DEACTIVATED');

-- CreateTable
CREATE TABLE "AppSumoLicense" (
    "id" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "prevLicenseKey" TEXT,
    "tier" INTEGER NOT NULL,
    "status" "AppSumoLicenseStatus" NOT NULL DEFAULT 'INACTIVE',
    "userId" TEXT,
    "lastEvent" TEXT NOT NULL,
    "lastEventAt" BIGINT NOT NULL,
    "deactivatedReason" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSumoLicense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSumoLicense_licenseKey_key" ON "AppSumoLicense"("licenseKey");

-- CreateIndex
CREATE INDEX "AppSumoLicense_userId_idx" ON "AppSumoLicense"("userId");

-- CreateIndex
CREATE INDEX "AppSumoLicense_prevLicenseKey_idx" ON "AppSumoLicense"("prevLicenseKey");

-- AddForeignKey
ALTER TABLE "AppSumoLicense" ADD CONSTRAINT "AppSumoLicense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
