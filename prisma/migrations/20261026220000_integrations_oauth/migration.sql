-- Integrations: HubSpot and Salesforce connections (Salsox as an OAuth
-- client), the Salesforce write-back job queue and the record a document was
-- sent from, and Salsox as an OAuth 2.0 authorization server (grants, codes,
-- tokens). Additive: new tables, two enums and one nullable column.

-- CreateEnum
CREATE TYPE "IntegrationJobStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "OAuthTokenKind" AS ENUM ('ACCESS', 'REFRESH');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "salesforceRecordId" TEXT;

-- CreateTable
CREATE TABLE "HubSpotConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "hubDomain" TEXT,
    "scopes" TEXT[],
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubSpotConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesforceConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "instanceUrl" TEXT NOT NULL,
    "sandbox" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesforceConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationJob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" "IntegrationJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "progress" JSONB NOT NULL DEFAULT '{}',
    "lastError" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "scopes" TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthCode" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scopes" TEXT[],
    "codeChallenge" TEXT NOT NULL,
    "grantId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "kind" "OAuthTokenKind" NOT NULL,
    "hash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotConnection_userId_key" ON "HubSpotConnection"("userId");

-- CreateIndex
CREATE INDEX "HubSpotConnection_hubId_idx" ON "HubSpotConnection"("hubId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesforceConnection_userId_key" ON "SalesforceConnection"("userId");

-- CreateIndex
CREATE INDEX "SalesforceConnection_orgId_idx" ON "SalesforceConnection"("orgId");

-- CreateIndex
CREATE INDEX "IntegrationJob_status_nextAttemptAt_idx" ON "IntegrationJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationJob_documentId_provider_event_key" ON "IntegrationJob"("documentId", "provider", "event");

-- CreateIndex
CREATE INDEX "OAuthGrant_userId_idx" ON "OAuthGrant"("userId");

-- CreateIndex
CREATE INDEX "OAuthGrant_clientId_userId_idx" ON "OAuthGrant"("clientId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthCode_hash_key" ON "OAuthCode"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_hash_key" ON "OAuthToken"("hash");

-- CreateIndex
CREATE INDEX "OAuthToken_grantId_idx" ON "OAuthToken"("grantId");

-- AddForeignKey
ALTER TABLE "HubSpotConnection" ADD CONSTRAINT "HubSpotConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesforceConnection" ADD CONSTRAINT "SalesforceConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationJob" ADD CONSTRAINT "IntegrationJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthGrant" ADD CONSTRAINT "OAuthGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "OAuthGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

