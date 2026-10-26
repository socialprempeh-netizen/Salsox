---
title: "Slack and e-signatures: share and track with {site}"
description: "Get documents signed faster from Slack: send a signer their link in a direct message, and post completions to a channel. What works today without a Slack app."
h1: "Slack and {site}: get signatures where your team already talks"
lede: "Your colleagues and many of your clients answer Slack before email. You can send a signer their link in a Slack message today and keep a channel up to date on signed documents. A native Slack app is not part of {site} yet."
primaryKeyword: "slack esignature"
aliases: ["esign in slack", "slack document signing", "slack signed document notification", "send contract for signature slack"]
published: 2026-10-24
updated: 2026-10-26
breadcrumb: "Slack"
integration: { name: "Slack", status: "works-today", url: "https://slack.com" }
faq:
  - q: "Is there a {site} app for Slack?"
    a: "No. What works today is sharing signing links in Slack messages and, with a Make scenario fed by {site}'s webhooks, posting to a channel as documents are viewed, signed or completed."
  - q: "Can I post a signing link in a channel?"
    a: "Do not. Each link belongs to one signer, and anyone who has it can open that signer's copy. Send it in a direct message to that person only."
  - q: "Will Slack show a preview of the document?"
    a: "No. The signing page does not expose the document in link previews, so the contents stay private even where Slack unfurls links."
related: ["/integrations/zapier", "/integrations/make", "/esignature-for/remote-teams", "/esignature-for/sales-teams", "/document-tracking"]
---

## Signatures from people who live in Slack

Internal paperwork stalls in email: the offer letter waiting on a manager, the vendor contract waiting on finance, the NDA a new contractor has not opened. The same people reply in Slack within minutes. {site} fits that habit without any setup, because a signing link is just a link, and Slack is a good place to send one.

## Sending a signer their link

After you send a document, open it in your dashboard. On the row of the person you are waiting for, use **Share**, then **Copy link**, and paste it into a direct message to them with a line of context: what it is, and why today. They tap it, read the document and sign in the browser, on the phone or the laptop where Slack is open. When they finish, the document page shows their signature with the time.

Keep each link to its own person. A signing link is how {site} knows who is signing, so posting it in a channel would let anyone there open that signer's copy. For a document with three signers, that means three direct messages, one link each.

## Keeping a channel up to date

Many teams keep a channel such as #contracts or #deals where finished paperwork is announced. Without a Slack app, two routes work today:

- **By hand.** When the completion email arrives, forward it to the channel's email address (in Slack, open the channel settings and choose **Integrations > Send emails to this channel**, available on paid workspaces). The message appears in the channel with the title and the download button.
- **Automatically, from webhooks.** A [Make](/integrations/make) scenario that starts from **Webhooks > Custom webhook**, with its address added under Dashboard → Developers, receives every event as it happens: *document.viewed*, *document.signed*, *document.completed*, *document.declined*. A **Slack > Create a Message** module then posts the document title and who acted to the channel. Link the message to the dashboard rather than the PDF, so the file stays with people who can sign in.
- **Automatically, from email.** Where you cannot add a webhook, a [Zapier](/integrations/zapier) Zap or a Make scenario can watch for {site}'s *is signed by everyone* email instead. It only sees completions, and only what the email says.

## Internal approvals

On the Business plan, a document can include an approver, someone who approves it rather than filling in signature fields, and everyone can be asked to act in a set order, each receiving it at their turn. Pairing this with a direct message to each person when their turn comes keeps a sequence moving without anyone checking their inbox.

## What a Slack app would add

There is no {site} Slack app today. If notifications in Slack per signature, or sending a template from a slash command, would save you time, say so on the contact page. Until then, the routines above cover the main reason teams ask: knowing the moment something is signed.
