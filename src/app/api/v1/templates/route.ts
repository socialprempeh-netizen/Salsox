/**
 * GET /api/v1/templates: what POST /api/v1/documents can send from. The
 * library's templates, each with its roles (who signs; the `you` role is the
 * sender) and its blanks, and the account's saved templates. Integration
 * platforms read it to fill a "Template" dropdown and to show which values
 * and recipients a chosen template asks for.
 */
import { NextResponse } from "next/server"
import { withApiKey } from "@/lib/api/v1"
import { libraryTemplates } from "@/lib/seo-agent/published-pages"
import { listSavedTemplates } from "@/lib/esign/templates"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return withApiKey(request, async (caller) => {
    const [library, saved] = await Promise.all([libraryTemplates(), listSavedTemplates(caller.userId)])
    return NextResponse.json({
      data: library.map((t) => ({
        slug: t.slug,
        title: t.h1,
        category: t.category,
        roles: t.roles.map((r) => ({ id: r.id, label: r.label, sender: r.you })),
        variables: Object.keys(t.variables),
      })),
      saved: saved.map((s) => ({ id: s.id, name: s.name, template: s.templateSlug, updated_at: s.updatedAt.toISOString() })),
    })
  })
}
