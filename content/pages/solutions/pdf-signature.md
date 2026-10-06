---
title: "PDF signature: drawn, typed, image and digital, explained"
description: "The four kinds of PDF signature, what each proves, and which to use. Drawn, typed and image signatures, certificate-based digital signatures, and audit trails."
h1: "PDF signatures: what each kind is, and what it proves"
lede: "\"Sign this PDF\" can mean four different things, from drawing your name with a finger to sealing the file with a certificate. They look similar on the page and prove very different things. This page explains each, so you can choose."
primaryKeyword: "pdf signature"
aliases: ["signature in pdf", "pdf signing", "digital signature pdf", "electronic signature pdf"]
published: 2026-10-06
updated: 2026-10-06
breadcrumb: "PDF signature"
benefits:
  - title: "All signature styles"
    body: "Draw with a finger or mouse, type your name, or upload an image of your handwritten signature."
  - title: "Evidence beyond the image"
    body: "Each signing records who, when and from where, and the final file's fingerprint is stored."
  - title: "A certificate seal when you need one"
    body: "On Business, the signed PDF can carry a certificate-based digital seal that PDF readers check for changes."
faq:
  - q: "Is a typed name a valid signature?"
    a: "In many jurisdictions, yes: what matters legally is usually the intent to sign and a reliable record of who signed, not how the mark looks. Check the requirements for your document type and country."
  - q: "What is the difference between an electronic and a digital signature in a PDF?"
    a: "An electronic signature is any electronic mark of agreement, such as a drawn or typed name. A digital signature is a cryptographic seal from a certificate that lets PDF readers detect any later change to the file."
  - q: "Why does my PDF reader say a signature is not trusted?"
    a: "Readers trust digital signatures whose certificate chains to an authority in their trust list. A seal from a certificate outside that list still detects changes but shows a warning about the signer's identity."
  - q: "Can I just add an image of my signature to a PDF?"
    a: "Yes, and the free Add signature to PDF tool does exactly that in your browser. On its own an image proves little about who placed it, which is why signing workflows add an audit trail."
related: ["/pdf-signature-generator", "/add-signature-to-pdf", "/blog/electronic-vs-digital-signatures", "/verify", "/business-esignature"]
---

## The four kinds of PDF signature

### Drawn signatures

You draw your signature with a finger, a stylus or a mouse, and it is placed on the page as an image. This is what most people picture, and it is the closest to signing on paper. It shows intent clearly. On its own, though, the drawing proves little about who made it: anyone can draw a squiggle.

### Typed signatures

You type your name and it is rendered in a script style. Typed signatures are common, quick and readable, and many legal systems accept them where the signer's intent is clear. Like a drawing, a typed name needs a record around it to prove who typed it.

### Image signatures

You upload a photo or scan of your handwritten signature and place it on the document. This is convenient when you sign often and want the same mark every time. The free [Add signature to PDF](/add-signature-to-pdf) tool works this way, and the [PDF signature generator](/pdf-signature-generator) creates a clean, transparent image to reuse.

### Certificate-based digital signatures

A digital signature is not a picture at all. It is a cryptographic value computed over the file with a private key and stored inside the PDF, together with a certificate. PDF readers such as Acrobat recompute it when you open the file: if a single byte changed after signing, the signature shows as broken. Whether the reader also shows the signer as "trusted" depends on who issued the certificate.

## What actually makes a signature hold up

For most everyday agreements, the strength of an electronic signature comes less from the mark than from the evidence around it:

- **Who received the link.** The signing link went to a specific email address and only that person's link could sign their fields.
- **What happened, when.** Viewing, each filled field, signing and completion are timestamped, with the signer's IP address and browser.
- **That the file did not change.** A fingerprint (SHA-256 hash) of the final PDF is recorded, so any later edit is detectable.

{site} records all three for every document sent for signature. Every completed document gets a verification code; anyone holding the PDF can check it on the [verification page](/verify) and confirm it is the sealed copy. On the Business plan, the audit trail is printed on a certificate page inside the PDF, and a certificate-based digital seal can be applied over the whole file.

## Which one should you use?

If you are signing something yourself and sending it back, a drawn or typed signature placed with the free [Sign PDF tool](/sign-pdf) is usually enough. If you are collecting signatures from others and may need to show later who signed, send it through a signing workflow so the evidence is recorded. If the recipient's systems check PDF signatures automatically, or your industry expects a certificate, use a digital seal. For the legal side, the article on [electronic versus digital signatures](/blog/electronic-vs-digital-signatures) goes into more depth.
