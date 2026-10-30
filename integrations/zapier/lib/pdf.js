/**
 * The request body for "Send Document From PDF" (creates/send-pdf.js), built
 * from what the person filled in, or the plain reason it cannot be sent: no
 * signer, more names than emails, no PDF. Pure, tested in test/pdf.test.js.
 */

const listOf = (value) => (Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value]).map((v) => String(v).trim()).filter(Boolean)

/** The request body, or the plain reason it cannot be sent. Pure, tested. */
function pdfBody(inputData) {
  const emails = listOf(inputData.signer_emails)
  const names = listOf(inputData.signer_names)
  if (emails.length === 0) return { problem: "Add at least one signer email." }
  if (names.length > emails.length) return { problem: `There are ${names.length} signer names but only ${emails.length} signer emails. Give the names in the same order as the emails, one name per email.` }
  const file = String(inputData.file || "").trim()
  if (!file) return { problem: "Add the PDF: a file from an earlier step, or a link to a PDF." }
  return {
    body: {
      file_url: file,
      recipients: emails.map((email, i) => ({ email, ...(names[i] ? { name: names[i] } : {}), role: "SIGNER" })),
      ...(inputData.title ? { title: inputData.title } : {}),
      ...(inputData.message ? { message: inputData.message } : {}),
      ...(inputData.expires_in_days ? { expires_in_days: Number(inputData.expires_in_days) } : {}),
    },
  }
}

module.exports = { pdfBody }
