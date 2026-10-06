-- Signup attribution for the SEO dashboard (src/lib/seo/attribution.ts):
-- where an account came from, as JSON, and its channel as an indexed column.
-- Additive: existing users keep null and count as "unknown".

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "acquisition" JSONB,
ADD COLUMN     "signupChannel" TEXT;

-- CreateIndex
CREATE INDEX "User_signupChannel_createdAt_idx" ON "User"("signupChannel", "createdAt");
