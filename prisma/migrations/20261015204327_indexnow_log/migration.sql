-- IndexNow log (src/lib/indexnow-store.ts): each submission and its answer,
-- the last accepted version of each URL, and one row per deployment that ran
-- its deploy-time sync. Additive: three new tables, nothing existing changes.

-- CreateTable
CREATE TABLE "IndexNowPing" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" TEXT NOT NULL,
    "urlCount" INTEGER NOT NULL,
    "urls" TEXT[],
    "status" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,

    CONSTRAINT "IndexNowPing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexNowUrl" (
    "url" TEXT NOT NULL,
    "lastModified" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexNowUrl_pkey" PRIMARY KEY ("url")
);

-- CreateTable
CREATE TABLE "IndexNowDeploy" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexNowDeploy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IndexNowPing_createdAt_idx" ON "IndexNowPing"("createdAt");
