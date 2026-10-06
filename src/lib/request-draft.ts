/**
 * A signature request prepared on the public request-a-signature tool,
 * carried across signup into Quick Send, so nobody has to choose the file and
 * type the emails twice.
 *
 * Kept in the browser's IndexedDB (a PDF can be several MB, too large for
 * sessionStorage), on this device only, for a day: long enough to confirm an
 * email address in between, short enough that a stale PDF does not appear in
 * a form weeks later. Nothing here talks to the server; the PDF is uploaded
 * only when the person presses Send in Quick Send.
 *
 * The draft is read without being removed (`peekRequestDraft`) and cleared
 * only once Quick Send has sent it (`clearRequestDraft`). It used to be
 * removed on first read, an hour at most after saving: a new account, whose
 * first send is refused until its email address is confirmed, came back from
 * confirming to an empty form, and the request was never sent.
 */

export type RequestDraft = { name: string; bytes: Uint8Array; emails: string; title: string; savedAt: number }

// Was 60 * 60 * 1000 (an hour), too short to go and confirm an email address.
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Whether a draft saved at `savedAt` may still be used at `now`. */
export function isDraftFresh(savedAt: number, now: number): boolean {
  return Number.isFinite(savedAt) && now - savedAt >= 0 && now - savedAt <= DRAFT_MAX_AGE_MS
}

const DB = "salsox-tools"
const STORE = "drafts"
const KEY = "request"

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        tx.oncomplete = () => db.close()
      })
  )
}

export async function saveRequestDraft(draft: Omit<RequestDraft, "savedAt">): Promise<void> {
  await run("readwrite", (store) => store.put({ ...draft, savedAt: Date.now() }, KEY))
}

/** The draft, if one is fresh, left in place. Null otherwise; never throws. */
export async function peekRequestDraft(): Promise<RequestDraft | null> {
  try {
    const draft = (await run("readonly", (store) => store.get(KEY))) as RequestDraft | undefined
    if (draft && isDraftFresh(draft.savedAt, Date.now())) return draft
    if (draft) await clearRequestDraft()
    return null
  } catch {
    return null
  }
}

/** Forgets the draft: called once Quick Send has sent it. Never throws. */
export async function clearRequestDraft(): Promise<void> {
  try {
    await run("readwrite", (store) => store.delete(KEY))
  } catch {
    // Nothing stored, or storage unavailable: nothing to clear.
  }
}

// Replaced by peekRequestDraft + clearRequestDraft (see the note at the top).
// export async function takeRequestDraft(): Promise<RequestDraft | null> {
//   try {
//     const draft = (await run("readonly", (store) => store.get(KEY))) as RequestDraft | undefined
//     await run("readwrite", (store) => store.delete(KEY))
//     return draft && isDraftFresh(draft.savedAt, Date.now()) ? draft : null
//   } catch {
//     return null
//   }
// }
