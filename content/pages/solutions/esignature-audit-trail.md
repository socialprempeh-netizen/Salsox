---
title: "eSignature audit trail: what is recorded and why"
description: "What an e-signature audit trail records: every view, signature and payment, with time, IP and device, plus a sealed PDF and a verification code."
h1: "E-signature audit trails: the record behind every signed document"
lede: "A signature is only as strong as the evidence of who made it and when. Every document sent with {site} carries an audit trail of what happened to it, from creation to the last signature."
primaryKeyword: "esignature audit trail"
aliases: ["audit trail", "signing records", "signature audit log", "e-signature evidence", "electronic signature audit trail", "document audit trail", "e-signature audit log", "electronic signing records", "proof of electronic signature"]
published: 2026-10-15
updated: 2026-10-16
breadcrumb: "Audit trail"
benefits:
  - title: "Every event, timed"
    body: "Creation, sending, each view, each field signed, reminders, corrections, payments and completion, each with a timestamp."
  - title: "Who and from where"
    body: "Each signer's email, IP address and device are recorded with their actions."
  - title: "Checkable later"
    body: "A verification code lets anyone confirm a signed PDF has not changed, on the public verify page."
faq:
  - q: "Is an audit trail proof of an electronic signature?"
    a: "It is the main evidence: it shows the signer's consent, the link sent to their own address, and the time and IP address of each step. Together with the sealed document, it is what you would rely on if a signature were disputed."
  - q: "Is the audit trail included on the free plan?"
    a: "Yes. Every document on every plan records its audit trail, and you can export documents and trails at any time. The Business plan adds a sealed PDF with a certificate page."
  - q: "What is the certificate page?"
    a: "On the Business plan, the completed PDF is sealed and gets an extra page listing each signer, when they signed and from what device, with a verification code."
  - q: "Can an audit trail be edited?"
    a: "No. Audit events are only ever added; they are not edited or deleted except when the whole account is deleted."
  - q: "How does someone check a signed document is genuine?"
    a: "They enter the document's verification code on the public verify page, which confirms the document and when it was completed."
related: ["/verify", "/document-signing-software", "/electronic-signature-software", "/pdf-signature", "/pricing"]
---

## What an audit trail is for

When a signed contract is challenged, the question is rarely "is there a signature on the page?" It is "who put it there, when, and was the document the same one they were shown?" An audit trail answers those questions with a record kept by the signing service, not by either party. Electronic signature laws such as the US ESIGN Act and the EU's eIDAS Regulation do not require a particular format, but courts and auditors look for exactly this kind of evidence.

## What {site} records

Every document has an append-only list of events. Among them:

- the document being created and sent, and to whom;
- each time a recipient opens their link;
- each field a recipient fills or signs, and when they finish;
- reminders, corrected email addresses and renewed links;
- a recipient declining, with the reason they gave;
- payments started, received, refunded or disputed on Sign & Pay documents;
- the document completing, being cancelled or expiring.

Each event carries a timestamp and, for actions taken by a recipient, their email address, IP address and device. Events are only ever added, never edited, and they stay with the document.

## The sealed PDF and its certificate

On the Business plan, the completed document is sealed: a final PDF is produced with every signature in place and an extra certificate page summarising who signed, when and from which device. A cryptographic fingerprint of the original upload and of the sealed file is stored, so any later change to either can be detected.

## Verification codes

Each completed document has a verification code. Anyone holding the signed PDF, such as a bank, a landlord or a court, can enter the code on the public [verify page](/verify) to confirm the document exists in {site}, when it was completed, and that it matches. No account is needed to check.

## Exporting your records

Your records are yours. On any plan you can export every document, original and signed, together with its audit trail, at any time, including after you cancel. Keep them with your own files or in your document management system.

## Checking a record yourself

Open any completed document from your documents list and its audit trail is listed beneath it, oldest event first. Read it the way a reviewer would: was the document sent to the address you expected, when was it first opened, and do the signing times make sense for the people involved? A signer who opened a contract at 9:02 and signed every field by 9:05 has a trail that tells its own story. If something looks wrong, the trail is where you start, and it is the same record anyone you share it with will see.

## Keeping and checking the record

An audit trail is only useful if you still have it when it is needed. [How long to keep signed documents](/blog/how-long-to-keep-signed-documents) covers retention, and [how to verify a signed PDF](/blog/how-to-verify-a-signed-pdf) shows how anyone holding the document can check it. For how the trail fits with the other protections, see [are electronic signatures secure?](/blog/are-electronic-signatures-secure)

## What it is not

{site} provides simple electronic signatures with a strong audit trail. It does not provide qualified electronic signatures backed by a government-recognised certificate, witnessed or notarised signing, or identity verification against official ID. Some documents in some countries need those; for everyday contracts, agreements, consent forms and acknowledgements, an audit trail like this is what is normally relied on.
