---
title: "How to verify a signed PDF is genuine"
description: "How to verify a signed PDF: checking digital signatures in a PDF reader, verification codes and audit trails from e-signature services, and file fingerprints that show changes."
date: 2026-10-16
category: Guides
keyword: "how to verify a signed pdf"
cover: "/blog/covers/how-to-verify-a-signed-pdf.png"
coverAlt: "How to verify a signed PDF: a signed document with a teal signature line, tagged with a check mark"
coverTitle: "How to verify a signed PDF is genuine"
coverLabel: "Verify"
related: ["/verify", "/blog/electronic-vs-digital-signatures", "/blog/how-long-to-keep-signed-documents", "/pricing"]
faq:
  - q: "How can I tell if a signed PDF has been altered?"
    a: "Check its digital signature in a PDF reader, which reports whether the file changed after signing, or compare the file's fingerprint (hash) with the one recorded when it was signed. Any change, even one character, gives a different fingerprint."
  - q: "Why does my PDF reader say a signature is not trusted?"
    a: "Usually because the certificate used to sign is not in the reader's list of trusted authorities. It does not mean the document was changed; the reader also reports separately whether the document was modified."
  - q: "How do I verify a document signed with Salsox?"
    a: "Open the verification page and enter the code printed on the document's certificate page, or scan its QR code. Add the PDF itself to check that the file matches the signed original; it is checked in your browser and never uploaded."
  - q: "Does verifying a document show its contents to anyone?"
    a: "Not on Salsox's verification page: it shows whether the record is genuine, when it was sealed and who signed, with masked email addresses, but never the title or the content."
---

A signed PDF arrives as an email attachment, and someone needs to rely on it: an employer checking an offer letter, a buyer checking a sales agreement, a lawyer checking a contract before a dispute. How do you know it is genuine, that the people named actually signed it, and that nobody changed a word afterwards? This guide covers the three ways to check, depending on how the document was signed.

## First, what kind of signature does it have?

PDFs get signed in different ways, and each leaves different evidence:

1. **A digital signature in the PDF**: a cryptographic seal applied with a certificate. PDF readers can check it.
2. **A record from an e-signature service**: a certificate page, an audit trail and often a verification code or QR code.
3. **An image of a signature** placed on the page, with nothing else. This is the hardest to verify.

Many documents have more than one: an e-signature service may add a certificate page *and* a digital seal. For the difference between electronic and digital signatures, see [electronic vs digital signatures](/blog/electronic-vs-digital-signatures).

## Method 1: check the digital signature in a PDF reader

Open the PDF in a reader that supports signatures, such as Adobe Acrobat Reader, and open its signature panel. For each signature it reports:

- **Whether the document has been modified** since the signature was applied. This is the most important line: a modification after signing breaks the seal.
- **Who signed**, according to the certificate.
- **Whether the certificate is trusted.**

The trust message confuses many people. A reader trusts certificates from authorities on its own list; a certificate from anywhere else shows as "unknown" or "not trusted" even when the document is untouched. **"Not trusted" is about the certificate's issuer, not about whether the file changed**; the reader reports that separately.

## Method 2: use the e-signature service's verification

Documents signed through an e-signature service usually carry their own evidence, typically on a certificate or summary page at the end: the signers, when each one signed, the audit trail and a fingerprint of the document.

Documents signed with Salsox on the Business plan carry a certificate page with a **verification code** and a **QR code**. Anyone holding the PDF can check it on the public [verification page](/verify):

1. **Enter the code**, or scan the QR code, which opens the page with the code filled in.
2. **Optionally add the PDF.** Your browser calculates the file's fingerprint and only the fingerprint is compared, so the file is never uploaded.
3. **Read the result.**

[![The Salsox verification page on a phone: a verification code entered, and the result "Genuine signed document", with the date it was sealed, the verification code, and the signer's name, masked email, role and signing time](/blog/screens/phone-verify.png)](/blog/screens/phone-verify.png)

A genuine document shows when it was sealed and who signed it, with email addresses masked. The page **never shows the document's title or contents**, so checking a document reveals nothing about it to the person checking. If you add the PDF and it has been changed, even re-saved in another program, the fingerprints won't match and the page says so.

## Method 3: compare the fingerprint yourself

A fingerprint, or **hash**, is a short string calculated from every byte of a file. Change one character and the hash changes completely. If the signing service recorded the hash of the signed PDF, you can recalculate it and compare:

- **Mac or Linux terminal:** `shasum -a 256 contract.pdf`
- **Windows command prompt:** `certutil -hashfile contract.pdf SHA256`

If the result matches the SHA-256 fingerprint recorded on the certificate page, the file is byte-for-byte the one that was sealed.

## What if it's just a signature image?

An image of a signature on a page proves very little on its own: it can be copied from another document in seconds. To rely on such a document, you need evidence from outside the file: the email it arrived with, confirmation from the person who supposedly signed it, or the original from whoever sent it. For anything important, ask for the document to be signed through a service that records the signing. Our guide to [creating a legally binding electronic signature](/blog/legally-binding-electronic-signature) explains what that record contains.

## Signs a signed PDF needs a closer look

- The reader says the document was **modified after signing**.
- The certificate page or verification code is **missing**, or the code doesn't verify.
- The fingerprint **doesn't match** the recorded one.
- The **dates don't make sense**: signed before it was sent, or at a time the signer couldn't have.
- The file arrived from an **unexpected address**.

None of these alone proves forgery, but each is a reason to confirm with the sender before relying on the document.

## Keep your own documents easy to verify

Store the original signed PDF untouched, with its audit trail, so you can prove it later. [How long to keep signed documents](/blog/how-long-to-keep-signed-documents) covers storage and retention. To send documents that carry their own verification code, [create a free account](/signup); the sealed certificate is on the Business plan, on the [pricing page](/pricing).

## Frequently asked questions

### How can I tell if a signed PDF has been altered?

Check its digital signature in a PDF reader, which reports whether the file changed after signing, or compare the file's fingerprint (hash) with the one recorded when it was signed. Any change, even one character, gives a different fingerprint.

### Why does my PDF reader say a signature is not trusted?

Usually because the certificate used to sign is not in the reader's list of trusted authorities. It does not mean the document was changed; the reader also reports separately whether the document was modified.

### How do I verify a document signed with Salsox?

Open the verification page and enter the code printed on the document's certificate page, or scan its QR code. Add the PDF itself to check that the file matches the signed original; it is checked in your browser and never uploaded.

### Does verifying a document show its contents to anyone?

Not on Salsox's verification page: it shows whether the record is genuine, when it was sealed and who signed, with masked email addresses, but never the title or the content.
