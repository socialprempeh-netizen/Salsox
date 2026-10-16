---
title: "How to create a legally binding electronic signature"
description: "What makes an electronic signature legally binding: intent, consent, attribution, association and record keeping under ESIGN, UETA and eIDAS, and how to capture each."
date: 2026-10-16
category: Legal
keyword: "legally binding electronic signature"
cover: "/blog/covers/legally-binding-electronic-signature.png"
coverAlt: "How to create a legally binding electronic signature: a document with a teal signature line, tagged with a section sign"
coverTitle: "How to create a legally binding electronic signature"
coverLabel: "§"
related: ["/blog/are-electronic-signatures-legal", "/blog/electronic-signature-vs-wet-signature", "/esignature-audit-trail", "/pricing"]
faq:
  - q: "What makes an electronic signature legally binding?"
    a: "The signer intended to sign, agreed to do business electronically, the signature is linked to that document, it can be attributed to the signer, and the signed record is kept and can be reproduced. The underlying agreement must also be a valid contract."
  - q: "Is a typed name a legally binding signature?"
    a: "It can be. A typed name typed with the intention to sign, linked to the document and backed by a record of who typed it, meets the definition in ESIGN and eIDAS."
  - q: "Do I need a qualified electronic signature?"
    a: "Only where a law or the other party requires one, mostly in specific EU procedures. For ordinary contracts in the US, UK and EU, a simple electronic signature with good evidence is enough."
  - q: "How do I prove who signed electronically?"
    a: "With the record kept at signing: the email address the link was sent to, the time and IP address of each step, the signer's consent, and a sealed copy of the final document. An audit trail holds all of these."
---

Almost anything can be an electronic signature: a typed name, a drawn squiggle, a tick in a box. That flexibility is why e-signatures are used everywhere, and also why the real question is not "is this a signature?" but "could I rely on it if the other side said they never signed?" This guide sets out what the main laws require and how to capture each element.

*This article is general information, not legal advice.*

## The legal starting point

The rule in most countries is the same: a signature cannot be refused legal effect **just because it is electronic**.

- **United States:** the federal **ESIGN Act** (2000) and the **Uniform Electronic Transactions Act** (UETA), adopted by nearly every state (New York has its own equivalent law).
- **European Union:** the **eIDAS Regulation** (No 910/2014), Article 25.
- **United Kingdom:** the Electronic Communications Act 2000 and the UK's retained version of eIDAS, with the Law Commission confirming in 2019 that e-signatures can execute most documents.
- **Canada:** federal PIPEDA and provincial electronic commerce acts, such as Ontario's Electronic Commerce Act, 2000.

None of these laws makes a signature binding on its own. They remove the objection that it is electronic. Whether a signed document binds anyone still depends on ordinary law: there must be a valid agreement, between people with capacity, on terms they accepted. What the e-signature laws add is a set of conditions, and what makes a signature *reliable* is the evidence that those conditions were met.

## The five elements of a binding electronic signature

### 1. Intent to sign

The signer meant to sign, not just to open or read. ESIGN's definition requires a signature "executed or adopted by a person with the intent to sign the record."

**How to capture it:** a clear, deliberate act. A button labelled "Sign" or "Adopt and sign", with wording that says this is a signature, is clearer than a signature that appears when someone scrolls.

### 2. Consent to do business electronically

The signer agreed to use electronic records and signatures. UETA applies only where the parties have agreed to transact electronically. ESIGN goes further for **consumers**: where a law requires information to be given to a consumer in writing, the consumer must consent electronically first, after being told about their rights.

**How to capture it:** an explicit consent step before signing. In Salsox, the signer ticks "I agree to sign electronically and to receive this document and related records electronically" before they can start.

[![The first screen a Salsox signer sees: who sent the document, the number of fields to fill, and the consent to sign electronically that must be ticked before signing](/blog/screens/phone-signing-start.png)](/blog/screens/phone-signing-start.png)

### 3. Attribution: it was this person

You must be able to show the signature is the act of the person named. UETA says this can be shown "in any manner", including by the efficacy of the security procedure used.

**How to capture it:** a link sent to the signer's own email address and usable only by them, plus a record of the email, time and IP address. Where the stakes are higher, add identity checks. Remind signers never to forward their link.

### 4. Association with the document

The signature must be "attached to or logically associated with" the specific document. A signature on page 3 of a file that has since changed is not a signature on the new version.

**How to capture it:** sign the final PDF, not an editable file, and seal it when signing completes. A **hash**, the document's fingerprint, shows whether a single character has changed since.

### 5. Record retention

ESIGN requires that, where a law requires a record to be kept, the electronic record **accurately reflects** the information and remains **accessible** to everyone entitled to it, in a form that can be reproduced.

**How to capture it:** everyone receives the same signed PDF, and the sender keeps it with its audit trail, exportable at any time.

## What a complete record looks like

Put together, those elements become an **audit trail**: a list of every event in the document's life. Here is the one Salsox keeps for each document:

[![A Salsox audit trail: document uploaded, sent for signature, opened by the recipient, each field completed and the signature, with times, email addresses and IP addresses](/blog/screens/audit-trail.png)](/blog/screens/audit-trail.png)

On the Business plan, the same trail is printed on a certificate page appended to the signed PDF, with the document's SHA-256 fingerprints and a verification code. Anyone holding the PDF can check that code on a public page to confirm the document was completed and has not been altered. We describe each recorded event in the [e-signature audit trail](/esignature-audit-trail) guide.

## Simple, advanced and qualified signatures

The EU's eIDAS defines three levels:

- **Simple:** any electronic signature. Valid evidence for most contracts.
- **Advanced:** uniquely linked to the signer, capable of identifying them, created with data under their sole control, and linked to the document so changes are detectable.
- **Qualified:** an advanced signature made with a certified device and backed by a qualified certificate from an approved provider. In the EU it is treated the same as a handwritten signature.

Most businesses never need a qualified signature. They exist for specific procedures where a law requires them. For ordinary agreements in the US, UK and EU, a simple electronic signature with a good record is what courts and counterparties expect. Salsox provides simple electronic signatures.

## Practical checklist before you send

- The document is **final** and in **PDF**.
- Each signer has **their own link**, sent to **their own email address**.
- Signers **consent** to signing electronically before they sign.
- The signing action is **deliberate and clearly labelled**.
- The final file is **sealed**, and everyone gets the **same signed copy**.
- You **keep** the signed PDF and audit trail with your records.
- You have checked the document is **not one of the exceptions**: wills, some family law and court documents, and documents that need a witness or notary in person in your jurisdiction. Our comparison of [electronic and wet signatures](/blog/electronic-signature-vs-wet-signature) lists the common ones.

For the law in more detail, region by region, read [are electronic signatures legally binding?](/blog/are-electronic-signatures-legal)

## Get a signature that holds up

Salsox records consent, every step and each signer's details on every plan, and seals the final PDF with a certificate on the Business plan. You can [start free](/signup) with 3 documents a month, or compare plans on the [pricing page](/pricing).

## Frequently asked questions

### What makes an electronic signature legally binding?

The signer intended to sign, agreed to do business electronically, the signature is linked to that document, it can be attributed to the signer, and the signed record is kept and can be reproduced. The underlying agreement must also be a valid contract.

### Is a typed name a legally binding signature?

It can be. A typed name typed with the intention to sign, linked to the document and backed by a record of who typed it, meets the definition in ESIGN and eIDAS.

### Do I need a qualified electronic signature?

Only where a law or the other party requires one, mostly in specific EU procedures. For ordinary contracts in the US, UK and EU, a simple electronic signature with good evidence is enough.

### How do I prove who signed electronically?

With the record kept at signing: the email address the link was sent to, the time and IP address of each step, the signer's consent, and a sealed copy of the final document. An audit trail holds all of these.

*General information, not legal advice. Laws differ by country, state and document and change over time; for a specific case, consult a qualified lawyer.*
