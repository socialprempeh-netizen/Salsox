---
title: "How electronic signatures work, step by step"
description: "What actually happens when you sign electronically: signing links, identity, audit trails, document fingerprints and seals, explained without jargon."
date: 2026-10-06
category: Guides
related: ["/online-esignature", "/pdf-signature", "/verify", "/electronic-signature-software"]
faq:
  - q: "What is a document hash?"
    a: "A short fingerprint computed from every byte of a file. Change one character and the fingerprint changes completely, which is how a system shows a signed PDF has not been altered."
  - q: "How does an e-signature system know who signed?"
    a: "Mostly through the channel: the signing link was sent to one person's email address and works only for them. The system records the address, the time and the device. Stronger checks, such as an ID document or a qualified certificate, are used where the law or the risk calls for them."
  - q: "Can an electronically signed document be edited afterwards?"
    a: "Not without it showing. Its fingerprint is recorded when it is sealed, so any later change produces a different fingerprint, and a digitally sealed PDF shows a broken seal in PDF readers."
---

An electronic signature looks simple from the outside: you open a link, draw your name and press finish. Underneath, a signing system is doing several things to make that click worth something later. Here is what they are, in the order they happen.

## 1. The document is fixed

Everything starts with a file that will not change. When a sender uploads a PDF, a good system stores the original exactly as uploaded and computes its **hash**: a fingerprint of every byte. {site} records this SHA-256 fingerprint for every upload. Fields that people fill in later are stored separately and only stamped onto a copy at the end, so the original is never edited in place.

Why it matters: if anyone later claims the signed document differs from what was agreed, the fingerprints of the original and the final copy settle it.

## 2. Each signer gets their own link

The sender adds recipients and decides what each one does: sign, approve, view, or receive a copy. Each signer gets a private link containing a long random token, sent to their email address (and, if the sender chooses, shared over WhatsApp or SMS).

That token is the signer's credential for this document. It is not guessable, it works only for that recipient's fields, and in {site} it is replaced the moment the sender corrects that recipient's address, so a link sent to a wrong person stops working.

## 3. Identity is established by the channel

How does the system know the person signing is who they claim to be? For most everyday agreements, by the channel: the link went to a specific address, and only someone with access to that inbox or phone could open it. The system records the email address, the IP address and the browser at each step.

Where the risk is higher, systems add more: a code by SMS, an identity document check, or a qualified certificate issued after in-person verification. Laws like the EU's eIDAS Regulation define these levels, from simple electronic signatures up to qualified ones. Most contracts between businesses and their customers use simple electronic signatures with a good audit trail.

## 4. The signer shows intent

The signer opens the document, reads it and fills their fields. The act of signing, whether drawing, typing or clicking to adopt a signature, is the expression of intent that the law cares about. Good systems make that act deliberate: the signer confirms they are signing, sees each field, and cannot finish while a required field is empty.

Each field is saved as it is filled, with a timestamp. If the document asks for payment, as with Sign & Pay, signing is not complete until the payment is.

## 5. Everything is written to an audit trail

Every event is appended to an **audit trail**: document created, sent, viewed, each field signed, each signer finished, document completed, with who, when and from where. In a well-designed system the trail is append-only, so nothing in it is edited or removed after the fact.

## 6. The document is sealed

When the last signer finishes, the system produces the final copy. In {site}, that means:

1. stamping every filled field onto the original PDF;
2. flattening any form fields, so nothing remains editable;
3. on the Business plan, appending a certificate page with the fingerprints, the recipients and the full audit trail, and optionally applying a certificate-based digital seal over the whole file;
4. computing the fingerprint of the sealed copy and storing it.

The sealed copy is then sent to everyone involved.

## 7. Anyone can check it later

A signed PDF often travels: forwarded to an accountant, attached to an application, printed for a file. Whoever ends up holding it may want to know whether it is genuine. Each completed {site} document carries a verification code; entering it on the [verification page](/verify), or scanning the QR code on the certificate, shows that it is a completed record, who signed and when, without showing the content. Dropping the PDF on the page also checks it is byte-for-byte the sealed copy.

## Putting it together

The drawn signature is the visible part. The fixed original, the private links, the recorded channel, the deliberate act, the append-only trail and the sealed, fingerprinted result are what make it hold up. When you compare [electronic signature software](/electronic-signature-software), those are the parts worth asking about.

## Frequently asked questions

### What is a document hash?

A short fingerprint computed from every byte of a file. Change one character and the fingerprint changes completely, which is how a system shows a signed PDF has not been altered.

### How does an e-signature system know who signed?

Mostly through the channel: the signing link was sent to one person's email address and works only for them. The system records the address, the time and the device. Stronger checks, such as an ID document or a qualified certificate, are used where the law or the risk calls for them.

### Can an electronically signed document be edited afterwards?

Not without it showing. Its fingerprint is recorded when it is sealed, so any later change produces a different fingerprint, and a digitally sealed PDF shows a broken seal in PDF readers.
