"use client"

/**
 * Webhooks on the Developers page: the form that adds an endpoint, and one
 * card per endpoint with its switch, events, a test sender, a new secret,
 * delete, and the latest deliveries with Resend for the ones that failed.
 *
 * Everything goes through the actions in src/app/actions/developers.ts,
 * which re-check every input; the page refreshes from the server after each.
 * A signing secret is shown once (SecretReveal) and never again.
 *
 * Phone-first: forms stack, cards keep long URLs on one truncated line, the
 * delivery log wraps. Square corners. New cards and delivery rows enter with
 * framer-motion, test results slide in; reduced motion makes them appear.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useFormatter, useTranslations } from "next-intl"
import { CheckCircle2, Clock, Plug, RotateCcw, Send, Trash2, XCircle } from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MotionSwitch } from "@/components/ui/motion-switch"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { createWebhookEndpoint, deleteWebhookEndpoint, redeliverWebhook, rotateWebhookSecret, sendTestWebhook, updateWebhookEndpoint } from "@/app/actions/developers"
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhooks/events"
import { cn } from "@/lib/utils"
import { SecretReveal } from "./secret-reveal"

export type DeliveryView = { id: string; event: string; status: "PENDING" | "SUCCEEDED" | "FAILED"; attempts: number; responseStatus: number | null; error: string | null; test: boolean; createdAt: string }
export type EndpointView = { id: string; url: string; events: string[]; enabled: boolean; description: string | null; source: string; deliveries: DeliveryView[] }

export function WebhookEndpoints({ endpoints, max }: { endpoints: EndpointView[]; max: number }) {
  const t = useTranslations("dashboard.developers")
  const reduceMotion = useReducedMotion()
  const [newSecret, setNewSecret] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <AnimatePresence>{newSecret && <SecretReveal key="secret" label={t("secretTitle")} value={newSecret} onDone={() => setNewSecret(null)} />}</AnimatePresence>

      {endpoints.length < max ? <AddEndpoint onCreated={setNewSecret} /> : <p className="text-sm text-muted-foreground">{t("endpointLimit", { max })}</p>}

      {endpoints.length === 0 ? (
        <p className="border border-dashed p-6 text-center text-sm text-muted-foreground">{t("noEndpoints")}</p>
      ) : (
        <ul className="space-y-4">
          <AnimatePresence initial={false}>
            {endpoints.map((e) => (
              <motion.li key={e.id} layout={!reduceMotion} initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <EndpointCard endpoint={e} onSecret={setNewSecret} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

function AddEndpoint({ onCreated }: { onCreated: (secret: string) => void }) {
  const t = useTranslations("dashboard.developers")
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [description, setDescription] = useState("")
  const [events, setEvents] = useState<WebhookEvent[]>([...WEBHOOK_EVENTS])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createWebhookEndpoint({ url, events, description: description || undefined })
      if (!result.ok) return setError(t(`errors.${result.error}`))
      setUrl("")
      setDescription("")
      if (result.secret) onCreated(result.secret)
      toast.success(t("endpointAdded"))
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4 border bg-card p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="webhook-url">{t("urlLabel")}</Label>
          <Input id="webhook-url" type="url" inputMode="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.example.com/esign" className="h-10 font-mono text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="webhook-description">{t("descriptionLabel")}</Label>
          <Input id="webhook-description" value={description} maxLength={120} onChange={(e) => setDescription(e.target.value)} placeholder={t("descriptionPlaceholder")} className="h-10" />
        </div>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">{t("eventsLabel")}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {WEBHOOK_EVENTS.map((ev) => {
            const on = events.includes(ev)
            return (
              <label key={ev} className={cn("flex cursor-pointer items-start gap-3 border p-3 transition-colors", on ? "border-primary/40 bg-primary/5" : "hover:bg-muted/50")}>
                <input type="checkbox" checked={on} onChange={() => setEvents((cur) => (on ? cur.filter((x) => x !== ev) : WEBHOOK_EVENTS.filter((x) => x === ev || cur.includes(x))))} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]" />
                <span className="min-w-0">
                  <span className="block font-mono text-xs font-medium">{ev}</span>
                  <span className="block text-xs text-muted-foreground">{t(`event.${ev.replace(".", "_")}`)}</span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>
      {error && <p role="alert" className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending || events.length === 0} className="h-10 w-full rounded-none sm:w-auto">
        <Plug className="mr-2 h-4 w-4" aria-hidden="true" />
        {t("addEndpoint")}
      </Button>
    </form>
  )
}

function EndpointCard({ endpoint: e, onSecret }: { endpoint: EndpointView; onSecret: (secret: string) => void }) {
  const t = useTranslations("dashboard.developers")
  const format = useFormatter()
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const [pending, startTransition] = useTransition()
  const [testEvent, setTestEvent] = useState<WebhookEvent>((e.events[0] as WebhookEvent) ?? "document.completed")
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  const describe = (r: { status: string; responseStatus?: number | null; error?: string | null } | null) => {
    if (!r) return { ok: false, text: t("testFailed", { reason: t("unknown") }) }
    if (r.status === "rate") return { ok: false, text: t("errors.rate") }
    if (r.status === "SUCCEEDED") return { ok: true, text: t("testOk", { status: r.responseStatus ?? 200 }) }
    return { ok: false, text: t("testFailed", { reason: r.error ?? t("unknown") }) }
  }

  function run(task: () => Promise<void>) {
    startTransition(async () => {
      await task()
      router.refresh()
    })
  }

  return (
    <article className={cn("border bg-card transition-opacity", !e.enabled && "opacity-75")}>
      <div className="flex items-start justify-between gap-3 border-b p-4 sm:px-5">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-medium" title={e.url}>{e.url}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {e.description && <span className="truncate">{e.description}</span>}
            {e.source === "api" && <span className="border px-1.5 py-px">{t("fromIntegration")}</span>}
            {!e.enabled && <span>{t("paused")}</span>}
          </p>
        </div>
        <MotionSwitch
          checked={e.enabled}
          disabled={pending}
          aria-label={t("enabledLabel")}
          onCheckedChange={(enabled) => run(async () => { const r = await updateWebhookEndpoint(e.id, { enabled }); if (!r.ok) toast.error(t("errors.invalid")) })}
        />
      </div>

      <div className="space-y-4 p-4 sm:px-5">
        <ul className="flex flex-wrap gap-1.5" aria-label={t("eventsLabel")}>
          {e.events.map((ev) => (
            <li key={ev} className="border bg-muted/50 px-2 py-0.5 font-mono text-xs">{ev}</li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor={`test-${e.id}`}>{t("testEventLabel")}</label>
          <select id={`test-${e.id}`} value={testEvent} onChange={(x) => setTestEvent(x.target.value as WebhookEvent)} className="h-10 border bg-background px-3 font-mono text-xs sm:w-56">
            {WEBHOOK_EVENTS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
          </select>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            className="h-10 rounded-none"
            onClick={() => { setTestResult(null); run(async () => setTestResult(describe(await sendTestWebhook(e.id, testEvent)))) }}
          >
            <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("sendTest")}
          </Button>
          <div className="flex gap-2 sm:ml-auto">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" disabled={pending} className="h-10 flex-1 rounded-none sm:flex-none">{t("rotate")}</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("rotateTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("rotateBody")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => run(async () => { const s = await rotateWebhookSecret(e.id); if (s) onSecret(s) })}>{t("rotateConfirm")}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" disabled={pending} className="h-10 flex-1 rounded-none text-destructive hover:text-destructive sm:flex-none">
                  <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t("delete")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => run(async () => { if (await deleteWebhookEndpoint(e.id)) toast.success(t("deleted")) })}>{t("delete")}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {testResult && (
            <motion.p
              role="status"
              initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cn("flex items-start gap-2 border px-3 py-2 text-sm", testResult.ok ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/10 text-destructive")}
            >
              {testResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              <span className="min-w-0 break-words">{testResult.text}</span>
            </motion.p>
          )}
        </AnimatePresence>

        <div>
          <h3 className="text-xs font-medium text-muted-foreground">{t("recentDeliveries")}</h3>
          {e.deliveries.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("noDeliveries")}</p>
          ) : (
            <ul className="mt-2 divide-y border">
              {e.deliveries.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <StatusChip status={d.status} attempts={d.attempts} />
                  <span className="font-mono text-xs">{d.event}</span>
                  {d.test && <span className="text-xs text-muted-foreground">{t("test")}</span>}
                  <span className="text-xs text-muted-foreground">{d.responseStatus ? `HTTP ${d.responseStatus}` : d.error ?? ""}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{format.dateTime(new Date(d.createdAt), { dateStyle: "medium", timeStyle: "short" })}</span>
                  {d.status !== "SUCCEEDED" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      className="h-8 rounded-none px-2"
                      onClick={() => run(async () => { const r = describe(await redeliverWebhook(d.id)); if (r.ok) toast.success(r.text); else toast.error(r.text) })}
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      {t("resend")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  )
}

function StatusChip({ status, attempts }: { status: DeliveryView["status"]; attempts: number }) {
  const t = useTranslations("dashboard.developers")
  if (status === "SUCCEEDED") return <span className="inline-flex items-center gap-1 text-xs font-medium text-primary"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{t("status.delivered")}</span>
  if (status === "FAILED") return <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive"><XCircle className="h-3.5 w-3.5" aria-hidden="true" />{t("status.failed")}</span>
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{attempts > 0 ? t("status.retrying", { attempts }) : t("status.sending")}</span>
}
