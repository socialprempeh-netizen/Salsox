"use client"

/**
 * Passkeys, on the Security page: the list of this account's passkeys, adding
 * one, and removing one. A passkey signs in with the device's own check
 * (fingerprint, face, PIN or a security key) and counts as a second factor
 * (src/lib/two-factor-policy.ts, hasSecondFactor).
 *
 * The WebAuthn ceremony runs in the browser by design, through Better Auth's
 * passkey client (src/lib/auth-client.ts); the server refuses it when an
 * admin has turned passkeys off (src/lib/auth/security-gate.ts). Only a
 * public key is stored; nothing secret reaches this component.
 *
 * New rows slide in and removed ones collapse with framer-motion; with reduced
 * motion they simply appear and go. Square corners, phone-first.
 */
import { useState, useSyncExternalStore, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useFormatter, useTranslations } from "next-intl"
import { Cloud, Fingerprint, KeyRound, Trash2 } from "lucide-react"
import { authClient } from "@/lib/auth-client"
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

const noSubscribe = () => () => {}

export type PasskeyRow = { id: string; name: string | null; createdAt: string | null; backedUp: boolean }

export function PasskeysCard({ passkeys, canAdd, isDemo }: { passkeys: PasskeyRow[]; canAdd: boolean; isDemo: boolean }) {
  const t = useTranslations("dashboard.security.passkeys")
  const format = useFormatter()
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const [name, setName] = useState("")
  const [busy, startTransition] = useTransition()
  // WebAuthn is in every current browser, but not in every embedded view.
  // Read as an external store: true on the server, the real answer once
  // hydrated, with no mismatch between the two.
  const supported = useSyncExternalStore(noSubscribe, () => "PublicKeyCredential" in window, () => true)

  function add() {
    startTransition(async () => {
      const result = await authClient.passkey.addPasskey({ name: name.trim() || undefined })
      if (result?.error) {
        // A cancelled prompt is the person's choice, not a failure.
        const cancelled = /cancel|abort|not allowed/i.test(String(result.error.message ?? ""))
        toast.error(cancelled ? t("cancelled") : t("addFailed"))
        return
      }
      setName("")
      toast.success(t("added"))
      router.refresh()
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await authClient.passkey.deletePasskey({ id })
      if (result?.error) {
        toast.error(t("removeFailed"))
        return
      }
      toast.success(t("removed"))
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 text-sm">
      {passkeys.length > 0 ? (
        <ul className="divide-y border">
          <AnimatePresence initial={false}>
            {passkeys.map((p) => (
              <motion.li
                key={p.id}
                layout={!reduceMotion}
                initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center border bg-muted" aria-hidden="true">
                    <Fingerprint className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name || t("unnamed")}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {p.createdAt && <span>{t("addedOn", { date: format.dateTime(new Date(p.createdAt), { dateStyle: "medium" }) })}</span>}
                      {p.backedUp && (
                        <span className="inline-flex items-center gap-1">
                          <Cloud className="h-3 w-3" aria-hidden="true" />
                          {t("synced")}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-9 w-9 shrink-0 rounded-none p-0" aria-label={t("removeLabel", { name: p.name || t("unnamed") })} disabled={busy}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("removeTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("removeBody")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(p.id)}>{t("remove")}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        <p className="text-muted-foreground">{t("none")}</p>
      )}

      {isDemo ? (
        <p className="text-muted-foreground">{t("demo")}</p>
      ) : !canAdd ? (
        <p className="text-muted-foreground">{t("disabledByAdmin")}</p>
      ) : !supported ? (
        <p className="text-muted-foreground">{t("unsupported")}</p>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="passkey-name">{t("nameLabel")}</Label>
          <p className="text-xs text-muted-foreground">{t("nameHint")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="passkey-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={t("namePlaceholder")} className="h-10 sm:w-64" />
            <Button type="button" onClick={add} disabled={busy} className="h-10 rounded-none">
              <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("add")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
