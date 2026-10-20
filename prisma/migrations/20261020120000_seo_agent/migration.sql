-- SEO agent (src/lib/seo-agent): targets picked from Search Console, the
-- articles written for them, links added to other pages at render time, the
-- run log, orphan pages from the weekly crawl and the agent's one setting.
-- Additive: six new tables and one enum, nothing existing changes.

-- CreateEnum
CREATE TYPE "SeoAgentTargetStatus" AS ENUM ('WRITING', 'DRAFT', 'PUBLISHED', 'DISCARDED', 'FAILED');

-- CreateTable
CREATE TABLE "seo_agent_targets" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "status" "SeoAgentTargetStatus" NOT NULL DEFAULT 'WRITING',
    "published_slug" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "page" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "seo_agent_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_agent_articles" (
    "id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "faq" JSONB NOT NULL,
    "related" TEXT[],
    "model" TEXT NOT NULL,
    "auto_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_agent_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_agent_links" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "source_path" TEXT NOT NULL,
    "after_paragraph" INTEGER NOT NULL,
    "sentence" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_agent_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_agent_runs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "candidates" INTEGER NOT NULL DEFAULT 0,
    "target_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "seo_agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_agent_orphans" (
    "path" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_agent_orphans_pkey" PRIMARY KEY ("path")
);

-- CreateTable
CREATE TABLE "seo_agent_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "draft_first" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_agent_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seo_agent_targets_keyword_key" ON "seo_agent_targets"("keyword");

-- CreateIndex
CREATE INDEX "seo_agent_targets_status_idx" ON "seo_agent_targets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "seo_agent_articles_target_id_key" ON "seo_agent_articles"("target_id");

-- CreateIndex
CREATE UNIQUE INDEX "seo_agent_articles_slug_key" ON "seo_agent_articles"("slug");

-- CreateIndex
CREATE INDEX "seo_agent_links_source_path_idx" ON "seo_agent_links"("source_path");

-- CreateIndex
CREATE UNIQUE INDEX "seo_agent_links_article_id_source_path_key" ON "seo_agent_links"("article_id", "source_path");

-- CreateIndex
CREATE INDEX "seo_agent_runs_kind_started_at_idx" ON "seo_agent_runs"("kind", "started_at");

-- AddForeignKey
ALTER TABLE "seo_agent_articles" ADD CONSTRAINT "seo_agent_articles_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "seo_agent_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_agent_links" ADD CONSTRAINT "seo_agent_links_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "seo_agent_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

