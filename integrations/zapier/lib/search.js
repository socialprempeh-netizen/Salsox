/**
 * The query for "Find Document" (searches/find-document.js), built from what
 * the person filled in, or the plain reason it cannot run. A title or an
 * email is required: a status alone would just return the latest document,
 * which is rarely the one a Zap means. Pure, tested in test/search.test.mjs.
 */

/** The API's status names (parseListQuery in src/lib/api/documents.ts). */
const STATUSES = ["pending", "completed", "declined", "expired", "cancelled", "draft"]

function searchParams(inputData) {
  const title = String(inputData.title || "").trim()
  const recipient = String(inputData.recipient || "").trim().toLowerCase()
  const status = String(inputData.status || "").trim().toLowerCase()
  if (!title && !recipient) return { problem: "Fill in the document title or the recipient email to search by." }
  if (status && !STATUSES.includes(status)) return { problem: `"${inputData.status}" is not a status. Choose one from the list.` }
  return {
    params: {
      ...(title ? { title } : {}),
      ...(recipient ? { recipient } : {}),
      ...(status ? { status } : {}),
      // The most recent match is the one a Zap acts on.
      limit: 1,
    },
  }
}

module.exports = { STATUSES, searchParams }
