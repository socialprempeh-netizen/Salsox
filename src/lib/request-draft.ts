/**
 * A signature request prepared on the public request-a-signature tool,
 * carried across signup into Quick Send, so nobody has to choose the file and
 * type the emails twice.
 *
 * Kept in the browser's IndexedDB (a PDF can be several MB, too large for
 * sessionStorage), on this device only, and only for an hour: a draft that old
 * was abandoned, and a stale PDF appearing in a form weeks later would be a
 * surprise. Reading it removes it (one hand-off, one use). Nothing here talks
 * to the server; the PDF is uploaded only when the person presses Send in
 * Quick Send.
 */

export type RequestDraft = { name: string; bytes: Uint8Array; emails: string; title: string; savedAt: number }

export const DRAFT_MAX_AGE_MS = 60 * 60 * 1000

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

/** The draft, if one is fresh, removed as it is read. Null otherwise, never throws. */
export async function takeRequestDraft(): Promise<RequestDraft | null> {
  try {
    const draft = (await run("readonly", (store) => store.get(KEY))) as RequestDraft | undefined
    await run("readwrite", (store) => store.delete(KEY))
    return draft && isDraftFresh(draft.savedAt, Date.now()) ? draft : null
  } catch {
    return null
  }
}
