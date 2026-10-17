---
title: "Are electronic signatures secure? What protects them"
description: "Are electronic signatures secure? How signing links, encryption, audit trails and sealed PDFs protect e-signed documents, the real risks, and how to reduce them."
date: 2026-10-16
category: Guides
keyword: "are electronic signatures secure"
cover: "/blog/covers/are-electronic-signatures-secure.png"
coverAlt: "Are electronic signatures secure: a sealed document with a teal signature line, tagged with a lock"
coverTitle: "Are electronic signatures secure?"
coverLabel: "Secure"
related: ["/blog/how-to-verify-a-signed-pdf", "/blog/correct-a-document-sent-for-signature", "/blog/legally-binding-electronic-signature", "/pricing"]
faq:
  - q: "Are electronic signatures more secure than paper signatures?"
    a: "Usually, yes. A good e-signature service records who signed, when and from where, and seals the final file so any change is detectable. A paper signature can be copied, and a page can be swapped without leaving a trace."
  - q: "Can an electronic signature be forged?"
    a: "An image of a signature can be copied easily. A signature made through a service is harder to fake, because it is tied to a personal link sent to the signer's own address and recorded with the time, IP address and consent."
  - q: "What is the biggest security risk with e-signatures?"
    a: "Usually the people, not the technology: a link forwarded to the wrong person, a phishing email that imitates a signing request, or an account with a weak password. Personal links, account security and checking who sent the request prevent most of it."
  - q: "Is it safe to upload confidential documents for signature?"
    a: "Check how the service stores them: encrypted connections, private storage, who can access files, and whether you can export and delete your documents. Avoid services that cannot answer those questions clearly."
---

Signing a contract by tapping a link on a phone can feel less secure than ink on paper. In practice, a well-built e-signature service usually gives *better* protection and better evidence than paper: it knows who opened the document, when each field was completed, and whether a single character changed afterwards. This guide explains what protects an e-signed document, where the real risks are, and what you can do about them.

## What protects an electronically signed document

### A personal link for each signer

Each signer gets their own link, sent to their own email address or phone. The link is the key: it lets that person, and only that person, open and sign. In Salsox each link carries a random 32-character token, about 190 bits of randomness, far beyond what anyone could guess, and each recipient's link is separate.

### Encryption in transit

Signing pages are served over HTTPS, so the document and the signature travel encrypted between the signer's device and the service.

### Private storage and an untouched original

Uploaded documents should be stored privately, not at a public web address. In Salsox, files are kept in private storage, and the original you upload is stored once and never modified: signatures go onto a separate sealed copy.

### An audit trail

Every step is recorded: when the document was sent, opened and signed, each field completed, with the email address and IP address. The trail is append-only, so events are added but not edited. It is what answers "who signed this, and when?" if anyone ever asks.

### A sealed final document

When everyone has signed, the final PDF is sealed with a fingerprint, a SHA-256 hash, recorded with the document. Change one character and the fingerprint no longer matches. On Salsox's Business plan, the signed PDF also carries a certificate page with the audit trail and a verification code anyone can check; see [how to verify a signed PDF](/blog/how-to-verify-a-signed-pdf).

## The real risks, and how to reduce them

Most problems with e-signatures come from people and process, not cryptography.

### A link that reaches the wrong person

A typo in an email address, or a link pasted into the wrong chat, sends someone else a key. The fix is to correct the recipient as soon as you notice: in Salsox, the old link **stops working immediately** and the right person gets a new one.

[![The Salsox Edit recipient dialog, noting that changing the email replaces their link: the old one stops working and the new address gets a fresh link](/blog/screens/edit-recipient.png)](/blog/screens/edit-recipient.png)

Links also **expire**, so an old link cannot be used months later. Our guide to [correcting a document after sending](/blog/correct-a-document-sent-for-signature) covers each fix.

### Forwarded links

A signer who forwards their link to an assistant lets the assistant sign as them. Tell signers plainly that their link is personal, and if someone else should sign, add them as a recipient instead.

### Phishing that imitates signing requests

Fraudsters send fake "please sign" emails to steal passwords or install malware. Teach your team, and remind clients, to:

- check the **sender's address**, not just the display name;
- be wary of signing requests they didn't expect;
- never enter an email password on a page reached from a signing link (a genuine signing link doesn't ask for one).

### Weak account security

Anyone who gets into a sender's account can send documents in their name. Use a strong, unique password and turn on **two-factor authentication**, which Salsox offers in account settings.

### Weak evidence

A signature image pasted into a PDF, or a print-and-scan copy, proves very little. If a document matters, sign it through a service that records consent, a personal link per signer and an audit trail. [How to create a legally binding electronic signature](/blog/legally-binding-electronic-signature) explains what that record needs to contain.

## Questions to ask any e-signature provider

- Are documents encrypted in transit and stored privately?
- Is the original kept unchanged, and is the final document sealed with a fingerprint?
- Is there a complete audit trail, and can I export it?
- Can I correct a wrong recipient so their old link stops working?
- Do links expire?
- Is two-factor authentication available for my account?
- Can I export and delete all my documents?

A provider that answers all of these clearly takes security seriously.

## How Salsox handles it

Salsox sends each signer a personal, unguessable link over HTTPS, keeps uploaded files in private storage, never modifies your original, records every step in an append-only audit trail, and seals the final PDF with a fingerprint. Wrong recipients can be corrected with the old link cancelled at once, links expire, accounts support two-factor authentication, and you can export every document and audit trail at any time, on any plan. The certificate page with a public verification code is on the Business plan.

## Try it

[Create a free account](/signup) and send a document to yourself to see the audit trail fill in; the free plan sends 3 documents a month. Paid plans are on the [pricing page](/pricing).

## Frequently asked questions

### Are electronic signatures more secure than paper signatures?

Usually, yes. A good e-signature service records who signed, when and from where, and seals the final file so any change is detectable. A paper signature can be copied, and a page can be swapped without leaving a trace.

### Can an electronic signature be forged?

An image of a signature can be copied easily. A signature made through a service is harder to fake, because it is tied to a personal link sent to the signer's own address and recorded with the time, IP address and consent.

### What is the biggest security risk with e-signatures?

Usually the people, not the technology: a link forwarded to the wrong person, a phishing email that imitates a signing request, or an account with a weak password. Personal links, account security and checking who sent the request prevent most of it.

### Is it safe to upload confidential documents for signature?

Check how the service stores them: encrypted connections, private storage, who can access files, and whether you can export and delete your documents. Avoid services that cannot answer those questions clearly.
