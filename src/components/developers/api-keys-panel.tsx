"use client"

/**
 * API keys on the Developers page: create one with a name (shown once, in
 * SecretReveal), see which keys exist by their first characters and when each
 * was last used, and revoke one. Keys let an integration such as Zapier act
 * for this account through /api/v1 (src/lib/api/v1.ts).
 *
 * Phone-first: the form stacks, rows wrap. Square corners. New rows enter
 * with framer-motion; reduced motion makes them appear.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useFormatter, useTranslations } from "next-intl"
import { KeySquare } from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { createApiKeyAction, revokeApiKeyAction } from "@/app/actions/developers"
import { SecretReveal } from "./secret-reveal"

export type ApiKeyView = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }

export function ApiKeysPanel({ keys }: { keys: ApiKeyView[] }) {
  const t = useTranslations("dashboard.developers")
  const format = useFormatter()
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const [name, setName] = useState("")
  const [newKey, setNewKey] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function create(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await createApiKeyAction(name)
      if (!result.ok) return void toast.error(t(`keyErrors.${result.error}`))
      setName("")
      setNewKey(result.key)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <AnimatePresence>{newKey && <SecretReveal key="key" label={t("keyTitle")} value={newKey} onDone={() => setNewKey(null)} />}</AnimatePresence>

      <form onSubmit={create} className="flex flex-col gap-2 border bg-card p-4 sm:flex-row sm:items-end sm:p-5">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="api-key-name">{t("keyNameLabel")}</Label>
          <Input id="api-key-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("keyNamePlaceholder")} className="h-10" />
        </div>
        <Button type="submit" disabled={pending} className="h-10 rounded-none">
          <KeySquare className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("createKey")}
        </Button>
      </form>

      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noKeys")}</p>
      ) : (
        <ul className="divide-y border bg-card">
          <AnimatePresence initial={false}>
            {keys.map((k) => (
              <motion.li key={k.id} initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center justify-between gap-3 p-3 sm:px-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{k.name}</p>
                  <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span className="font-mono">{k.prefix}…</span>
                    <span>{k.lastUsedAt ? t("lastUsed", { when: format.dateTime(new Date(k.lastUsedAt), { dateStyle: "medium", timeStyle: "short" }) }) : t("neverUsed")}</span>
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" size="sm" variant="ghost" disabled={pending} className="rounded-none text-destructive hover:text-destructive">{t("revoke")}</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("revokeTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("revokeBody")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => startTransition(async () => { if (await revokeApiKeyAction(k.id)) toast.success(t("revoked")); router.refresh() })}>{t("revoke")}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
