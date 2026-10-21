-- Outreach agent (src/lib/outreach-agent): leads found from public complaints
-- about other e-signature tools, the emails and follow-ups written to them,
-- replies with their classification, the suppression list, social posts, the
-- run log and the settings row. Additive: seven new tables and six enums,
-- nothing existing changes.

-- CreateEnum
CREATE TYPE "OutreachLeadStatus" AS ENUM ('NEEDS_CONTACT', 'READY', 'CONTACTED', 'REPLIED', 'SKIPPED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "OutreachMessageKind" AS ENUM ('INITIAL', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "OutreachMessageStatus" AS ENUM ('DRAFT', 'SENT', 'DISCARDED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutreachReplyCategory" AS ENUM ('INTERESTED', 'QUESTION', 'NOT_NOW', 'NOT_INTERESTED', 'UNSUBSCRIBE', 'OUT_OF_OFFICE', 'OTHER');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('FACEBOOK', 'LINKEDIN', 'X');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED', 'DISCARDED');

-- CreateTable
CREATE TABLE "outreach_leads" (
    "id" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "competitor" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "rating" INTEGER,
    "quote" TEXT NOT NULL,
    "complaint" TEXT NOT NULL,
    "reviewer_name" TEXT,
    "reviewer_role" TEXT,
    "company" TEXT,
    "email" TEXT,
    "status" "OutreachLeadStatus" NOT NULL DEFAULT 'NEEDS_CONTACT',
    "tracker_contact_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_messages" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "kind" "OutreachMessageKind" NOT NULL,
    "status" "OutreachMessageStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fix_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "auto_sent" BOOLEAN NOT NULL DEFAULT false,
    "provider_id" TEXT,
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_replies" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" "OutreachReplyCategory" NOT NULL,
    "summary" TEXT NOT NULL,
    "provider_id" TEXT,
    "source" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_suppressions" (
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_suppressions_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "outreach_social_posts" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "body" TEXT NOT NULL,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_for" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "external_id" TEXT,
    "error" TEXT,
    "model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_social_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_agent_runs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "outreach_agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_agent_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "review_every" BOOLEAN NOT NULL DEFAULT false,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "daily_cap" INTEGER NOT NULL DEFAULT 20,
    "signature" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_agent_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outreach_leads_source_key_key" ON "outreach_leads"("source_key");

-- CreateIndex
CREATE INDEX "outreach_leads_status_idx" ON "outreach_leads"("status");

-- CreateIndex
CREATE INDEX "outreach_leads_email_idx" ON "outreach_leads"("email");

-- CreateIndex
CREATE INDEX "outreach_messages_lead_id_kind_idx" ON "outreach_messages"("lead_id", "kind");

-- CreateIndex
CREATE INDEX "outreach_messages_status_sent_at_idx" ON "outreach_messages"("status", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_replies_provider_id_key" ON "outreach_replies"("provider_id");

-- CreateIndex
CREATE INDEX "outreach_replies_lead_id_idx" ON "outreach_replies"("lead_id");

-- CreateIndex
CREATE INDEX "outreach_social_posts_status_scheduled_for_idx" ON "outreach_social_posts"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "outreach_agent_runs_kind_started_at_idx" ON "outreach_agent_runs"("kind", "started_at");

-- AddForeignKey
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "outreach_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_replies" ADD CONSTRAINT "outreach_replies_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "outreach_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
