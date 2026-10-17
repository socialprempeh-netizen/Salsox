/**
 * Signing steps: how a sequential document's recipients group into steps,
 * and where a sent document has got to.
 *
 * The engine already routes by `order` (rules.ts): in a SEQUENTIAL document a
 * recipient's turn comes once every signer and approver with a lower order
 * has signed, and recipients sharing an order sign at the same time. What was
 * missing was a way to *set* a shared order, since the editor numbered
 * everyone 0, 1, 2, and a way to *show* the steps. This file is both
 * directions, as pure functions:
 *
 *  - `ordersFromSteps` turns the editor's list (in display order, each
 *    recipient optionally "at the same step as the one above") into orders;
 *  - `joinFlagsFromOrders` turns stored orders back into those flags, so a
 *    saved draft reopens as it was set up;
 *  - `signingSteps` groups recipients into numbered steps, each marked done,
 *    current or upcoming, for the document page and the editor's preview.
 *
 * Only signers and approvers take part in the order. Viewers and people who
 * get a copy are never a step: they receive the finished document.
 */
import type { RecipientRole, SigningOrder, SigningStatus } from "@prisma/client"

export const STEP_ROLES: RecipientRole[] = ["SIGNER", "APPROVER"]
export const isStepRole = (role: RecipientRole) => STEP_ROLES.includes(role)

/**
 * Orders for recipients listed in display order. A signer or approver with
 * `joinPrevious` shares the step of the nearest signer or approver above it;
 * otherwise it starts the next step. The first one always starts step 1.
 * Viewers and copy recipients are given the current step's order, which the
 * engine ignores for them, so their position in the list is kept.
 */
export function ordersFromSteps(recipients: { role: RecipientRole; joinPrevious: boolean }[]): number[] {
  let step = 0
  let seenStep = false
  return recipients.map((r) => {
    if (!isStepRole(r.role)) return Math.max(step, 0)
    if (!(r.joinPrevious && seenStep)) step += 1
    seenStep = true
    return step
  })
}

/**
 * The inverse, for recipients sorted by order: a signer or approver joins the
 * previous step when the nearest signer or approver before it has the same
 * order.
 */
export function joinFlagsFromOrders(recipients: { role: RecipientRole; order: number }[]): boolean[] {
  let previous: number | null = null
  return recipients.map((r) => {
    if (!isStepRole(r.role)) return false
    const joins = previous !== null && r.order === previous
    previous = r.order
    return joins
  })
}

export type StepState = "done" | "current" | "upcoming"

export type SigningStep<R> = {
  /** 1-based, in order. */
  number: number
  recipients: R[]
  /** done: everyone in it has signed; current: their turn; upcoming: waiting on an earlier step. */
  state: StepState
}

/**
 * The steps of a document's signers and approvers, in order, each with its
 * state. A PARALLEL document is one step: everyone at once. A step is done
 * when all its members have signed, and the first step that is not done is
 * the current one. A declined recipient stops the document, so no step after
 * one with a decline is current.
 */
export function signingSteps<R extends { role: RecipientRole; order: number; signingStatus: SigningStatus }>(
  recipients: R[],
  signingOrder: SigningOrder
): SigningStep<R>[] {
  const actionable = recipients.filter((r) => isStepRole(r.role))
  const groups =
    signingOrder === "PARALLEL"
      ? actionable.length ? [actionable] : []
      : [...new Set(actionable.map((r) => r.order))].sort((a, b) => a - b).map((order) => actionable.filter((r) => r.order === order))

  let currentFound = false
  let blocked = false
  return groups.map((group, i) => {
    let state: StepState
    if (group.every((r) => r.signingStatus === "SIGNED")) state = "done"
    else if (!currentFound && !blocked) {
      state = "current"
      currentFound = true
    } else state = "upcoming"
    if (group.some((r) => r.signingStatus === "REJECTED")) blocked = true
    return { number: i + 1, recipients: group, state }
  })
}

/** The step number of each signer and approver, for labels. Viewers and copy recipients are absent. */
export function stepNumbers<R extends { role: RecipientRole; order: number; signingStatus: SigningStatus }>(
  recipients: R[],
  signingOrder: SigningOrder
): Map<R, number> {
  const out = new Map<R, number>()
  for (const step of signingSteps(recipients, signingOrder)) for (const r of step.recipients) out.set(r, step.number)
  return out
}
