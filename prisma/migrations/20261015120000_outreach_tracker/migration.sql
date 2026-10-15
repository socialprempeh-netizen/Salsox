-- The founder's outreach tracker (/admin/outreach): one row per manual
-- conversation with a prospect. Additive: a new table and two new enums,
-- nothing existing changes.

-- CreateEnum
CREATE TYPE "OutreachChannel" AS ENUM ('LINKEDIN', 'EMAIL', 'REDDIT');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('NO_REPLY', 'REPLIED', 'CONVERTED');

-- CreateTable
CREATE TABLE "OutreachContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "channel" "OutreachChannel" NOT NULL,
    "contactedAt" DATE NOT NULL,
    "status" "OutreachStatus" NOT NULL DEFAULT 'NO_REPLY',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutreachContact_contactedAt_idx" ON "OutreachContact"("contactedAt");
