---
title: "eSignature API: what it is, and does {site} have one?"
description: "What an e-signature API does, when you need one, and a plain answer: {site} has no public API today. Who publishes one, and what {site} offers."
h1: "Electronic signature APIs: what they do, and where {site} stands"
lede: "An e-signature API lets your own software send documents for signature and react when they are signed. {site} does not offer a public API today. Here is what an API is for, who publishes one, and how to tell whether you need it."
primaryKeyword: "esignature api"
aliases: ["electronic signature api", "e-signature api", "digital signature api", "embedded esignature", "esign api"]
published: 2026-10-15
updated: 2026-10-15
breadcrumb: "eSignature API"
faq:
  - q: "Does {site} have an API?"
    a: "No. {site} has no public API, webhooks or embedded signing today. Documents are sent from its own dashboard, from a phone or a computer."
  - q: "Which e-signature providers publish an API?"
    a: "Several do, including DocuSign, Dropbox Sign, signNow, DocuSeal and SignWell, each with its own pricing for API use. Check each provider's developer documentation and pricing."
  - q: "Do I need an API?"
    a: "Only if your own software must start signing or react to it automatically, for example creating contracts from a CRM or embedding signing in your app. If people send documents by hand, you do not."
related: ["/vs/docuseal", "/vs/signwell", "/vs/docusign", "/electronic-signature-software", "/pricing"]
---

## What an e-signature API does

An API (application programming interface) lets one piece of software ask another to do something. An e-signature API lets your application create a signing request, upload a document, place fields, add signers, send it, and learn when it has been viewed, signed or declined, without anyone opening the e-signature provider's website.

Typical uses:

- **Automated contracts**: a CRM or booking system generates a contract when a deal closes and sends it for signature automatically.
- **Embedded signing**: your own app shows the signing screen inside its pages, so customers never leave your product.
- **Back-office workflows**: a signed document triggers the next step, such as creating an account, releasing a delivery or filing a record.
- **Volume**: sending hundreds of near-identical documents from data rather than by hand.

Most APIs are paired with webhooks, messages the provider sends your server when something happens, so your system can react the moment a document is signed.

## The plain answer about {site}

{site} does not have a public API today, and it has no webhooks or embedded signing. Documents are sent from the {site} dashboard by a person, on a phone or a computer. We would rather say so on this page than let you discover it after signing up.

## Who publishes one

If you need an API now, several providers publish one. Our comparison pages note it where it matters: [DocuSeal](/vs/docuseal) lists an API and embedding on its Pro plans with per-document API pricing; [SignWell](/vs/signwell) lists a monthly allowance of free API documents; [DocuSign](/vs/docusign), [Dropbox Sign](/vs/dropbox-sign) and [signNow](/vs/signnow) all have developer programmes. Compare their API pricing as well as their plan prices: per-document API fees can matter more than the subscription.

## Do you actually need one?

Many teams searching for an API need something simpler: a way to send documents quickly, track them and get paid. Ask:

1. Will software, not a person, decide when a document is sent? If people decide, you do not need an API.
2. Must signing happen inside your own product's pages? If a link to a signing page is fine, you do not need embedding.
3. Are you sending hundreds of documents a day from data? If you send a few a day, a dashboard is faster to set up and cheaper to run.

If the answers are no, {site}'s dashboard covers the job: upload a PDF or start from a template, add signers, send by email, WhatsApp or SMS, and track every signature, with deposits collected through [Sign & Pay](/sign-and-pay) on the Business plan.

## What {site} offers instead

- Signing links that work in any phone browser, with no account for signers.
- Quick Send, which places a signature and date field for each signer automatically.
- A documents list with status filters and search, automatic reminders and an audit trail per document.
- Export of every document and audit trail at any time.

If an API is essential to you, choose a provider that publishes one today.
