-- Public document verification (src/lib/esign/verify.ts) and opt-in SMS
-- reminders (src/lib/esign/sms.ts). Both columns are additive: existing rows
-- keep working, a null code verifies by document id, and SMS stays off.

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "smsReminders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verificationCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Document_verificationCode_key" ON "Document"("verificationCode");
