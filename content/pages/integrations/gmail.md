---
title: "Gmail and e-signatures: sign and send with {site}"
description: "How signing requests from {site} arrive in Gmail, how to send a signing link from your own Gmail, and how to keep signed PDFs findable in your inbox."
h1: "Gmail and {site}: signing requests that land where people read"
lede: "Most of the people you send documents to read their email in Gmail. {site}'s signing requests and reminders arrive there like any message, signing works in the Gmail app's browser, and you can send a signing link from your own Gmail too."
primaryKeyword: "gmail esignature"
aliases: ["esign from gmail", "send document for signature gmail", "gmail signing request", "signing link gmail"]
published: 2026-10-24
updated: 2026-10-24
breadcrumb: "Gmail"
integration: { name: "Gmail", status: "works-today", url: "https://mail.google.com" }
faq:
  - q: "Do I need a Gmail add-on to use {site}?"
    a: "No. There is no add-on to install. {site} sends signing requests by email itself, and you can also copy a signer's link and send it from Gmail yourself."
  - q: "My signer cannot find the email. What should they check?"
    a: "The Spam folder first, then the Promotions and Updates tabs. Searching Gmail for the document title usually finds it. You can also copy the signer's link from the document page and send it to them directly."
  - q: "Can a signer sign from the Gmail app on a phone?"
    a: "Yes. The button in the email opens the signing page in a browser, where they read the document and sign one field at a time, with no account and no app."
related: ["/integrations/google-drive", "/integrations/zapier", "/send-documents-for-signature", "/request-signature", "/document-tracking"]
---

## How a signing request reaches a Gmail inbox

When you send a document, each signer receives an email from {site} with the subject *Your name sent you "Title" to sign*, a short note if you wrote one, and a **Review and sign** button. In Gmail it usually lands in Primary or Updates. The button opens the signing page in the phone's or computer's browser; nothing is downloaded and the signer does not create an account.

If a signer has not acted, reminders follow with the subject *Reminder: "Title" is waiting for your signature*. Gmail threads messages by subject, so each reminder sits apart from the original and shows at the top of the inbox again.

## Sending the link from your own Gmail

Some people answer email from colleagues faster than email from a service they have not heard of. For them, open the document in your dashboard, use **Share** on the signer's row, and choose **Copy link**. Paste it into a Gmail message of your own, with a line of context. On a phone, **Share** can also open your mail app directly with the link filled in.

Each link belongs to one signer. Send it only to that person: anyone holding it can open that signer's copy of the document.

## Getting through Gmail's filters

Gmail filters on reputation, and {site}'s messages are authenticated so Gmail can verify where they come from. A few habits still help. Tell the person a document is on its way, especially the first time. Use a clear title like *Consulting agreement - Acme*, not *Final v3*. Keep the note short and avoid links of your own inside it. If a signer finds the request in Spam, marking it **Not spam** teaches Gmail for next time.

## Finding signed documents later

When everyone has signed, all parties get *"Title" is signed by everyone* with a download button for the PDF. In Gmail, a filter on that phrase can apply a **Signed** label and skip the inbox, which turns the label into a running index of every completed agreement. Searching `label:signed acme` then finds a client's documents in a second.

## What there is not

{site} has no Gmail add-on, does not read your inbox, and does not send from your Gmail address. Signing requests come from {site}'s own address, which is what lets them carry reminders and tracking. To act on completion emails automatically, see the [Zapier](/integrations/zapier) page.
