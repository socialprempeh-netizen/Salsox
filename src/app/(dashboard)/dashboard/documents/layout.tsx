/**
 * Shared frame for every Documents page (list, new, Quick Send, editor,
 * detail).
 *
 * Its one job is the confirm-your-email notice: a sender whose own address is
 * not confirmed yet cannot send (src/lib/esign/sending-limits.ts), and every
 * page in this section either sends or leads to sending, so the explanation
 * belongs above all of them instead of being repeated in each. Once the
 * address is confirmed, or on a deployment with no email configured, this
 * renders the page and nothing else.
 */
import { requireUser } from "@/lib/auth"
import { emailAwaitingConfirmation } from "@/lib/esign/sender"
import { ConfirmEmailNotice } from "@/components/esign/confirm-email-notice"

export default async function DocumentsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const unconfirmedEmail = await emailAwaitingConfirmation(user.id)

  return (
    <>
      {unconfirmedEmail && <ConfirmEmailNotice email={unconfirmedEmail} />}
      {children}
    </>
  )
}
