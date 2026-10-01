"use client"

/**
 * Per-recipient controls on the detail page:
 *   - Share: copy the link, or send it through WhatsApp, SMS or email from
 *     the sender's own phone (no SMS provider involved).
 *   - Edit: fix a wrong email or name in place. Changing the email rotates the
 *     link, so the one that went to the wrong address stops working, and the
 *     new address is sent a fresh link immediately.
 *   - Resend: the same link again, for "I can't find the email".
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Copy, Mail, MessageCircle, MessageSquareText, Pencil, Send, Share2 } from "lucide-react"
import { resendRecipientAction, updateRecipientAction } from "@/app/actions/documents"
import { mailtoShareUrl, shareMessage, smsShareUrl, whatsappShareUrl } from "@/lib/esign/share"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/components/ui/sonner"

type Props = {
  documentId: string
  documentTitle: string
  senderName: string
  recipient: { id: string; name: string; email: string; phone: string | null }
  url: string | null
  canEdit: boolean
  canResend: boolean
}

export function RecipientActions({ documentId, documentTitle, senderName, recipient, url, canEdit, canResend }: Props) {
  const t = useTranslations("esign.recipient")
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(recipient.name)
  const [email, setEmail] = useState(recipient.email)
  const [phone, setPhone] = useState(recipient.phone ?? "")
  const [pending, startTransition] = useTransition()

  const message = url ? shareMessage(documentTitle, url, senderName) : ""

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t("copied"))
    } catch {
      toast.error(t("copyFailed"))
    }
  }

  function save() {
    startTransition(async () => {
      const result = await updateRecipientAction(recipient.id, documentId, { name, email, phone: phone || undefined })
      if (result.error) return void toast.error(result.error)
      // The correction is saved either way; "a new link sent" is only said
      // when the email with it actually went.
      if (result.emailFailed) toast.error(t("updatedEmailFailed"))
      else if (result.emailNotConfigured) toast.warning(t("updatedNotEmailed"))
      else toast.success(result.tokenRotated ? t("updatedRotated") : t("updated"))
      setEditing(false)
      router.refresh()
    })
  }

  function resend() {
    startTransition(async () => {
      const result = await resendRecipientAction(recipient.id, documentId)
      // A refused email comes back as an error, with a way to try again.
      if (result.error) return void toast.error(result.error, { action: { label: t("retry"), onClick: resend } })
      toast.success(t("resent"))
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {url && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" aria-label={t("share")}>
              <Share2 className="h-4 w-4" /> {t("share")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={copy}>
              <Copy className="h-4 w-4" /> {t("copyLink")}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={whatsappShareUrl(message, recipient.phone)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" /> {t("whatsapp")}
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={smsShareUrl(message, recipient.phone)}>
                <MessageSquareText className="h-4 w-4" /> {t("sms")}
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={mailtoShareUrl(recipient.email, documentTitle, message)}>
                <Mail className="h-4 w-4" /> {t("email")}
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {canEdit && (
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" /> {t("edit")}
        </Button>
      )}
      {canResend && (
        <Button size="sm" variant="ghost" loading={pending} onClick={resend}>
          <Send className="h-4 w-4" /> {t("resend")}
        </Button>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
            <DialogDescription>{t("editBody")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor={`name-${recipient.id}`}>{t("name")}</Label>
              <Input id={`name-${recipient.id}`} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`email-${recipient.id}`}>{t("emailLabel")}</Label>
              <Input id={`email-${recipient.id}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`phone-${recipient.id}`}>{t("phone")}</Label>
              <Input id={`phone-${recipient.id}`} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+233 20 123 4567" />
              <p className="text-xs text-muted-foreground">{t("phoneHint")}</p>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>{t("close")}</Button>
              <Button type="submit" loading={pending}>{t("save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
