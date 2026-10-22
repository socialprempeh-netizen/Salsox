-- SEO agent, second mode (src/lib/seo-agent/page-agent.ts): the template,
-- comparison, alternative and e-signature law pages it now writes instead of
-- blog articles, with each page's quality-gate report. Additive: one new
-- table and two enums, nothing existing changes.

-- CreateEnum
CREATE TYPE "SeoAgentPageKind" AS ENUM ('TEMPLATE', 'COMPARISON', 'ALTERNATIVE', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "SeoAgentPageStatus" AS ENUM ('DRAFT', 'FLAGGED', 'PUBLISHED', 'DISCARDED', 'FAILED');

-- CreateTable
CREATE TABLE "seo_agent_pages" (
    "id" TEXT NOT NULL,
    "kind" "SeoAgentPageKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "SeoAgentPageStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL DEFAULT '',
    "data" JSONB,
    "body" TEXT NOT NULL DEFAULT '',
    "report" JSONB,
    "similarity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "similar_to" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "auto_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_agent_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seo_agent_pages_kind_slug_key" ON "seo_agent_pages"("kind", "slug");

-- CreateIndex
CREATE INDEX "seo_agent_pages_status_idx" ON "seo_agent_pages"("status");
