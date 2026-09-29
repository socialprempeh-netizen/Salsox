/**
 * Automatic field placement for Quick Send.
 *
 * Quick Send skips the field editor entirely: upload, type emails, send. The
 * fields still have to go somewhere, so each signer gets a signature box and a
 * date box stacked in a band at the bottom of the last page, one row per
 * signer. When there are more signers than rows fit, a signature block page is
 * appended at seal time instead (see `needsSignaturePage`).
 *
 * Coordinates are page percentages (see the Field model).
 */
import type { FieldType } from "@prisma/client"

export type PlacedField = {
  recipientIndex: number
  type: FieldType
  page: number
  x: number
  y: number
  width: number
  height: number
}

/** Rows that fit in the bottom band of an ordinary page before overlap risk. */
export const MAX_ROWS_ON_LAST_PAGE = 3

const ROW_HEIGHT = 7 // % of page height
const BOTTOM_MARGIN = 4
const SIGNATURE = { x: 8, width: 42 }
const DATE = { x: 56, width: 24 }

/** True when the signature block must go on its own appended page. */
export function needsSignaturePage(signerCount: number): boolean {
  return signerCount > MAX_ROWS_ON_LAST_PAGE
}

/**
 * Places one SIGNATURE + DATE pair per signer.
 *
 * @param pageCount pages in the uploaded PDF
 * @param signerCount number of signers, in order
 * @returns fields referencing signers by index; `page` may be pageCount + 1
 *          when a dedicated signature page is needed.
 */
export function autoPlaceFields(pageCount: number, signerCount: number): PlacedField[] {
  if (signerCount <= 0) return []
  const ownPage = needsSignaturePage(signerCount)
  const page = ownPage ? pageCount + 1 : pageCount
  // On its own page the block starts near the top; otherwise rows grow upwards
  // from the bottom margin so the last signer sits lowest, as on paper.
  const topOf = (i: number) =>
    ownPage ? 12 + i * (ROW_HEIGHT + 3) : 100 - BOTTOM_MARGIN - (signerCount - i) * ROW_HEIGHT

  return Array.from({ length: signerCount }, (_, i) => [
    { recipientIndex: i, type: "SIGNATURE" as const, page, y: topOf(i), height: ROW_HEIGHT - 1, ...SIGNATURE },
    { recipientIndex: i, type: "DATE" as const, page, y: topOf(i), height: ROW_HEIGHT - 1, ...DATE },
  ]).flat()
}
