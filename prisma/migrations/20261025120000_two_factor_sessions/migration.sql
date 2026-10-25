-- Two-factor: when each session passed a second factor (admins need it for
-- the admin area), and when a user dismissed the suggestion to turn 2FA on
-- (src/lib/two-factor-policy.ts). Additive: two nullable columns.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twoFactorNudgeDismissedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "twoFactorVerifiedAt" TIMESTAMP(3);

