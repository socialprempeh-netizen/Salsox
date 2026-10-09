-- Marks documents sent from a request prepared on the public
-- request-a-signature tool, so a free account's single free use of the tool
-- can be counted (FREE_REQUEST_TOOL_USES in src/lib/esign/plans.ts).
-- Additive: existing documents keep false, so no account has used it yet.

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "fromRequestTool" BOOLEAN NOT NULL DEFAULT false;
