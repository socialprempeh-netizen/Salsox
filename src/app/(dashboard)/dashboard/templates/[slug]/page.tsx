/**
 * /dashboard/templates/{slug}: use a template from the library.
 *
 * Shows who signs it and how many fields it places, links to the full
 * preview on its public page, and hands the blanks to the form
 * (use-template-form.tsx), which creates the draft and opens the editor.
 * `?saved={id}` loads one of the user's saved copies into the form.
 *
 * Whether saving is offered is decided here from the plan; the save action
 * checks again.
 */
import Link from "next/link"
import { notFound } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { requireUser } from "@/lib/auth"
import { getTemplate } from "@/lib/templates"
import { getSavedTemplate } from "@/lib/esign/templates"
import { senderPlan } from "@/lib/esign/sender"
import { FREE_DOCUMENTS_PER_MONTH, hasFeature } from "@/lib/esign/plans"
import { FreeAllowanceNotice } from "@/components/esign/plan-upsell"
import { UseTemplateForm } from "@/components/templates/use-template-form"
import { roleTone } from "@/components/templates/role-tone"

export default async function UseTemplatePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser()
  const { slug } = await params
  const { saved: savedId } = await searchParams
  const template = getTemplate(slug)
  if (!template) notFound()

  const t = await getTranslations("dashboard.templates")
  const format = await getFormatter()
  const [plan, saved] = await Promise.all([senderPlan(user.id), savedId ? getSavedTemplate(user.id, savedId) : Promise.resolve(null)])
  const fromSaved = saved && saved.templateSlug === template.slug ? saved : null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/dashboard/templates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("back")}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{template.h1}</h1>
        <p className="mt-1 text-muted-foreground">{template.lede}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          {template.roles.map((role, i) => (
            <span key={role.id} className={`border px-2 py-1 font-medium ${roleTone(i)}`}>
              {role.label}
              {role.you ? ` (${t("you")})` : ""}
            </span>
          ))}
          <span className="text-muted-foreground">{t("fieldsPlaced", { count: template.fields.length, signers: format.list(template.roles.map((r) => r.label), { type: "conjunction" }) })}</span>
        </div>
        <Link href={template.path} target="_blank" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
          {t("preview")} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <FreeAllowanceNotice left={plan.documentsLeft} total={FREE_DOCUMENTS_PER_MONTH} />

      <UseTemplateForm
        slug={template.slug}
        defaultTitle={template.h1}
        variables={Object.entries(template.variables).map(([name, sample]) => ({ name, sample }))}
        initialValues={fromSaved?.values ?? {}}
        saved={fromSaved ? { id: fromSaved.id, name: fromSaved.name } : null}
        canSave={hasFeature(plan.tier, "savedTemplates")}
      />
    </div>
  )
}
