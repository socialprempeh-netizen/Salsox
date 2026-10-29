-- SEO agent page matrix (src/lib/seo-agent/page-matrix.ts): the industry,
-- role and industry-in-a-country pages it writes under /esignature-for are
-- stored as a new page kind. Additive: one enum value, nothing existing changes.

-- AlterEnum
ALTER TYPE "SeoAgentPageKind" ADD VALUE 'USE_CASE';
