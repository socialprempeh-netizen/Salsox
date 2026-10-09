---
title: "Document signing software for the whole signing lifecycle"
description: "Document signing software that handles more than the signature: links that expire and renew, reminders, corrections, verification and a full export."
h1: "Document signing software that handles what happens after you press send"
lede: "A signature takes seconds. A document's life around it takes weeks: it waits, expires, gets sent to a wrong address, needs a nudge, gets signed, and has to be found again a year later. This page covers how {site} handles each of those stages."
primaryKeyword: "document signing software"
aliases: ["document signing app", "pdf signing software", "contract signing software", "online document signing"]
published: 2026-10-06
updated: 2026-10-06
breadcrumb: "Document signing software"
benefits:
  - title: "Every state is visible"
    body: "Draft, out for signature, completed, declined, cancelled or expired, with each recipient's progress beside it."
  - title: "Nothing has to be rebuilt"
    body: "Corrections and renewals keep the fields and signatures already in place."
  - title: "Findable and portable"
    body: "Completed documents are listed, verifiable by code, and exportable in one ZIP."
faq:
  - q: "Which file types can I send?"
    a: "PDF only, up to 4 MB per document. Export other formats (Word, Google Docs, Pages) to PDF first; the PDF is what everyone signs, so it is what should be checked."
  - q: "What happens when a link expires?"
    a: "The document moves to Expired and you are emailed. Renew it in one click: signers who had not finished get fresh links, and signatures already given stay."
  - q: "Can a signer decline?"
    a: "Yes, with a reason. The document is marked as declined, you are told why, and nobody else is asked to sign."
  - q: "How long are signed documents kept?"
    a: "For as long as your account exists. You can download any of them, or export everything at once, at any time."
related: ["/send-documents-for-signature", "/electronic-signature-software", "/fill-and-sign-pdf", "/verify", "/pricing"]
---

## The lifecycle of a signed document

Every document in {site} moves through a small set of states, and the software's job is to make each transition obvious and each problem fixable.

### Draft

You upload a PDF and set it up: recipients, their roles, where each field goes, whether people sign in order, how long links stay valid, and the message they will read. A draft can be saved and finished later. The uploaded original is stored untouched; everything you add is kept separately and stamped only when the document is sealed.

### Out for signature

Once sent, each recipient has their own link. The document page shows, per person, whether the invitation was delivered, whether they have opened it and whether they have signed. Two things happen in the background:

- **Reminders.** Recipients who have not signed get an automatic nudge every three days. You can send one by hand too.
- **Expiry.** Links expire after 7, 14, 30 or 90 days, or never, as you chose. Expiry protects against an old link being used months later.

### When something goes wrong

The two most common problems in any signing tool are a mistyped email address and a link that expired before someone got to it. Many tools make you void the document and start again. Here, a recipient's address is edited in place (their old link stops working at once) and an expired document is renewed with one click. Fields and signatures already on the document stay exactly where they were.

If a signer declines, they can give a reason. The document is closed, you are told, and nobody else is asked to sign a document one party has refused.

### Completed

When the last signer finishes, the fields are stamped onto the original, any form fields are flattened so nothing remains editable, and the result is stored with its SHA-256 fingerprint. Everyone receives the signed copy. On the Business plan, a certificate page with the full audit trail is appended, and a certificate-based digital seal can be applied over the file.

Each completed document also has a verification code. Whoever holds the PDF, including someone you never sent it to, can enter that code on the [verification page](/verify) and see that it is a genuine, completed record: who signed and when, without the content being shown. They can even drop the file on the page to confirm it is byte-for-byte the sealed copy.

### Years later

Signed documents stay in your account. When you need them all, for an audit, a migration or a backup, the export produces a ZIP of every original, every signed PDF and every audit trail, on any plan, including after you cancel.

## Where it fits, and where it does not

This lifecycle is built for people who send their own documents, one at a time or a few a day. {site} does not provide reusable templates, bulk sending to hundreds of recipients, or an API to start signing from another system. For a single document that needs your own text and fields, the free [Fill and sign PDF](/fill-and-sign-pdf) tool handles it in the browser; for anything that needs other people's signatures, a free account sends three documents a month and [paid plans](/pricing) remove the count.
