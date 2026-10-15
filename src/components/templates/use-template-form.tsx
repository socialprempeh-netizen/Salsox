"use client"

/**
 * The "Use this template" form in the dashboard (/dashboard/templates/{slug}).
 *
 * The sender types the real values for the template's blanks (each shows its
 * sample as a placeholder, and one button fills them all with the samples to
 * try it out), names the document, and creates it: the server renders the
 * PDF, places the signing fields and opens the draft in the editor, where the
 * signers' emails are added and it is sent.
 *
 * Below, a customised copy can be saved to reuse (a Personal-plan feature:
 * on the free plan the panel explains that instead of offering a button that
 * would fail). The panel opens and closes with a short height animation
 * (framer-motion); under prefers-reduced-motion it snaps.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Bookmark, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createFromTemplateAction, deleteSavedTemplateAction, saveTemplateAction } from "@/app/actions/templates"
import { track } from "@/lib/analytics"

export function UseTemplateForm({
  slug,
  defaultTitle,
  variables,
  initialValues,
  saved,
  canSave,
}: {
  slug: string
  defaultTitle: string
  /** Each blank and its sample, in document order. */
  variables: { name: string; sample: string }[]
  initialValues: Record<string, string>
  saved: { id: string; name: string } | null
  canSave: boolean
}) {
  const t = useTranslations("dashboard.templates")
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [title, setTitle] = useState(saved?.name ?? defaultTitle)
  const [saveOpen, setSaveOpen] = useState(Boolean(saved))
  const [saveName, setSaveName] = useState(saved?.name ?? "")
  const [creating, startCreate] = useTransition()
  const [saving, startSave] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const empty = variables.filter((v) => !values[v.name]?.trim()).length

  const create = () => {
    setError(null)
    startCreate(async () => {
      const result = await createFromTemplateAction({ slug, title, values })
      if (result.error || !result.documentId) return setError(result.error ?? t("failed"))
      // The end of the template funnel: a real document made from it. Copy
      // and download are recorded on the public page; this one was not.
      track("template_used", { template: slug, action: "create" })
      toast.success(t("created"))
      router.push(`/dashboard/documents/${result.documentId}/edit`)
    })
  }

  const save = () => {
    startSave(async () => {
      const result = await saveTemplateAction({ slug, name: saveName, values, id: saved?.id ?? null })
      if (result.error) return void toast.error(result.error)
      toast.success(t("saved"))
      if (!saved && result.savedId) router.replace(`/dashboard/templates/${slug}?saved=${result.savedId}`)
      else router.refresh()
    })
  }

  const remove = () => {
    if (!saved) return
    startSave(async () => {
      const result = await deleteSavedTemplateAction(saved.id)
      if (result.error) return void toast.error(result.error)
      toast.success(t("deleted"))
      router.replace("/dashboard/templates")
    })
  }

  return (
    <div className="space-y-6">
      <section className="border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">{t("blanksTitle")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("blanksHint", { count: variables.length })}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setValues(Object.fromEntries(variables.map((v) => [v.name, v.sample])))}>
            <Sparkles className="h-4 w-4" aria-hidden="true" /> {t("useSamples")}
          </Button>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="template-title">{t("documentTitle")}</Label>
            <Input id="template-title" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {variables.map((v, i) => {
            const id = `blank-${i}`
            const long = v.sample.length > 60
            return (
              <div key={v.name} className={long ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
                <Label htmlFor={id}>{v.name}</Label>
                {long ? (
                  <Textarea id={id} rows={3} value={values[v.name] ?? ""} placeholder={v.sample} maxLength={2000} onChange={(e) => setValues((s) => ({ ...s, [v.name]: e.target.value }))} />
                ) : (
                  <Input id={id} value={values[v.name] ?? ""} placeholder={v.sample} maxLength={500} onChange={(e) => setValues((s) => ({ ...s, [v.name]: e.target.value }))} />
                )}
              </div>
            )
          })}
        </div>
        <div className="space-y-3 border-t border-border p-4">
          {empty > 0 && <p className="text-sm text-muted-foreground">{t("emptyBlanks", { count: empty })}</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="button" size="lg" className="w-full sm:w-auto" loading={creating} onClick={create}>
            {t("create")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("createHint")}</p>
        </div>
      </section>

      <section className="border border-border bg-card">
        <button type="button" onClick={() => setSaveOpen((o) => !o)} aria-expanded={saveOpen} className="flex w-full items-center justify-between gap-3 p-4 text-left">
          <span className="flex items-center gap-2 font-semibold">
            <Bookmark className="h-4 w-4" aria-hidden="true" /> {saved ? t("savedTitle", { name: saved.name }) : t("saveTitle")}
          </span>
          <span aria-hidden className="text-muted-foreground">{saveOpen ? "−" : "+"}</span>
        </button>
        <AnimatePresence initial={false}>
          {saveOpen && (
            <motion.div
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="space-y-3 border-t border-border p-4">
                {canSave ? (
                  <>
                    <p className="text-sm text-muted-foreground">{t("saveHint")}</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <label className="flex-1">
                        <span className="sr-only">{t("saveName")}</span>
                        <Input value={saveName} placeholder={t("saveNamePlaceholder")} maxLength={80} onChange={(e) => setSaveName(e.target.value)} />
                      </label>
                      <Button type="button" variant="outline" loading={saving} disabled={!saveName.trim()} onClick={save}>
                        {saved ? t("update") : t("save")}
                      </Button>
                    </div>
                    {saved && (
                      <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={saving}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" /> {t("delete")}
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("saveLocked")}{" "}
                    <Link href="/dashboard/billing" className="font-medium text-primary underline underline-offset-4">
                      {t("upgrade")}
                    </Link>
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  )
}
