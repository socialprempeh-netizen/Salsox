-- Social studio (/admin/outreach/social): three platforms that are drafted
-- but never published by the agent (Reddit is posted by hand from its own
-- submit page; TikTok and YouTube need a video), the title and description
-- they need, and the idea and batch a set of drafts came from.
-- Additive: new enum values and nullable columns, nothing existing changes.

-- AlterEnum
ALTER TYPE "SocialPlatform" ADD VALUE 'REDDIT';
ALTER TYPE "SocialPlatform" ADD VALUE 'TIKTOK';
ALTER TYPE "SocialPlatform" ADD VALUE 'YOUTUBE';

-- AlterTable
ALTER TABLE "outreach_social_posts" ADD COLUMN "title" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "idea" TEXT,
ADD COLUMN "batch_id" TEXT;

-- CreateIndex
CREATE INDEX "outreach_social_posts_batch_id_idx" ON "outreach_social_posts"("batch_id");
