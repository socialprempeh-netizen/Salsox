---
title: "Electronic vs digital signatures in PDFs: the difference"
description: "Electronic and digital signatures are not the same thing. What each one is, how PDF readers treat them, why some show as untrusted, and which you need."
date: 2026-10-06
category: Guides
related: ["/pdf-signature", "/pdf-signature-generator", "/blog/how-electronic-signatures-work", "/business-esignature"]
faq:
  - q: "Is a digital signature more legally valid than an electronic one?"
    a: "Not automatically. In most legal systems both can be valid; what matters is intent and attribution. Some regulated documents require a qualified certificate-based signature, which is a specific kind of digital signature."
  - q: "Why does Adobe Acrobat say \"at least one signature has problems\"?"
    a: "Usually because the certificate that made the digital signature is not in Acrobat's trusted list, or because the file was changed after signing. The first is about identity; the second means the content is no longer what was signed."
  - q: "Do I need a digital certificate to sign a PDF?"
    a: "No. A drawn or typed electronic signature needs no certificate. Certificates are needed only to apply a digital signature."
---

People use "electronic signature" and "digital signature" as if they meant the same thing. In a PDF they are different objects, they protect different things, and PDF readers treat them differently. Here is the distinction, and how to decide which you need.

## Electronic signature: the broad category

An electronic signature is any electronic indication that someone agrees to a document. That includes:

- a signature drawn with a finger or mouse;
- a typed name rendered in a script font;
- an uploaded image of a handwritten signature;
- clicking a button that says "I agree and sign".

In a PDF, a drawn or typed electronic signature is usually stamped onto the page as an image or text. It is part of what you *see*. On its own, the mark proves little about who made it or whether the document changed afterwards. That proof comes from the record kept around it: the audit trail of who received the signing link, who opened it, and when and where it was signed.

## Digital signature: a cryptographic seal

A digital signature is a specific technology. A value is computed over the bytes of the PDF using a private key and stored inside the file along with a certificate (PKCS#7 or a related format). When you open the PDF, the reader recomputes the value with the public key from the certificate:

- if the file has changed since signing, the signature shows as **invalid**, because the content is no longer what was signed;
- if the file is unchanged, the signature shows as **valid** for integrity;
- separately, the reader checks whether it **trusts the certificate**, meaning whether it chains up to an authority in its trust list.

A digital signature is mostly invisible. Some PDFs show a stamp where it was applied, but the protection is in the file's structure, not the picture.

## Why a valid signature can show as "untrusted"

This confuses people more than anything else. A digital signature answers two separate questions:

1. **Has the document changed?** Answered by the cryptography. This works with any certificate.
2. **Who signed it?** Answered by the certificate's issuer. A reader such as Acrobat shows the signer as trusted only if the certificate comes from an authority on its list, such as the Adobe Approved Trust List or the EU Trusted Lists.

So a seal from a certificate outside those lists still proves integrity, and the reader still warns that it cannot vouch for the signer's identity.

## How the two combine in practice

Most e-signature workflows use both:

1. Each person signs **electronically**: a drawn, typed or uploaded signature, with each action recorded in an audit trail.
2. When everyone has signed, the system can apply a **digital seal** over the final PDF, so any later change is detectable by any PDF reader.

{site} works this way. Every document gets electronic signatures, an append-only audit trail and a recorded SHA-256 fingerprint, plus a verification code anyone can check. On the Business plan, a certificate page with the audit trail is appended to the PDF and a certificate-based digital seal can be applied over the whole file.

## Which do you need?

- **Signing your own copy of a form or agreement:** an electronic signature is enough. The free [Sign PDF](/sign-pdf) tool or the [signature generator](/pdf-signature-generator) will do.
- **Collecting signatures from others on ordinary contracts:** electronic signatures with an audit trail. That is the evidence that matters if anything is disputed.
- **The recipient checks PDFs for tampering automatically**, or you want any later edit to be visible to whoever opens the file: add a digital seal.
- **The law requires a qualified signature** for your document (some regulated filings in the EU, for example): use a provider that issues qualified certificates after identity verification.

For a fuller tour of the signature types a PDF can carry, see the [PDF signature](/pdf-signature) page.

## Frequently asked questions

### Is a digital signature more legally valid than an electronic one?

Not automatically. In most legal systems both can be valid; what matters is intent and attribution. Some regulated documents require a qualified certificate-based signature, which is a specific kind of digital signature.

### Why does Adobe Acrobat say "at least one signature has problems"?

Usually because the certificate that made the digital signature is not in Acrobat's trusted list, or because the file was changed after signing. The first is about identity; the second means the content is no longer what was signed.

### Do I need a digital certificate to sign a PDF?

No. A drawn or typed electronic signature needs no certificate. Certificates are needed only to apply a digital signature.
