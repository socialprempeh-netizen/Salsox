/**
 * Colour-coded document status. Labels come from `esign.status.*`.
 */
import { getTranslations } from "next-intl/server"
import type { DocumentStatus } from "@prisma/client"
import { Badge } from "@/components/ui/badge"

const VARIANT: Record<DocumentStatus, "default" | "secondary" | "success" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  PENDING: "default",
  COMPLETED: "success",
  REJECTED: "destructive",
  CANCELLED: "outline",
  EXPIRED: "destructive",
}

export async function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const t = await getTranslations("esign.status")
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>
}
