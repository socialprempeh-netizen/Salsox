/**
 * The translated options and labels the template library (template-library.tsx)
 * needs, built once on the server for both places it appears: the public
 * /templates page and /dashboard/templates. Passing them as props keeps the
 * public pages' client message payload unchanged.
 */
import { getTranslations } from "next-intl/server"
import { INDUSTRY_IDS, TEAM_IDS, TEMPLATE_CATEGORIES, TEMPLATE_TYPES } from "@/lib/templates-taxonomy"
import type { LibraryLabels } from "@/components/templates/template-library"

export async function libraryProps() {
  const t = await getTranslations("templates")
  const tx = await getTranslations("templates.taxonomy")
  const options = {
    category: Object.fromEntries(TEMPLATE_CATEGORIES.map((c) => [c, tx(`category.${c}.label`)])),
    industry: Object.fromEntries(INDUSTRY_IDS.map((i) => [i, tx(`industry.${i}`)])),
    team: Object.fromEntries(TEAM_IDS.map((x) => [x, tx(`team.${x}`)])),
    type: Object.fromEntries(TEMPLATE_TYPES.map((x) => [x, tx(`type.${x}`)])),
  }
  const labels: LibraryLabels = {
    search: t("library.search"),
    searchPlaceholder: t("library.searchPlaceholder"),
    facets: { category: t("library.category"), industry: t("library.industry"), team: t("library.team"), type: t("library.type") },
    any: t("library.any"),
    clear: t("library.clear"),
    // "{count}" passed through literally: the client fills in the number.
    resultsOne: t("library.resultsOne", { count: "{count}" }),
    resultsOther: t("library.resultsOther", { count: "{count}" }),
    empty: t("library.empty"),
  }
  return { options, labels }
}
