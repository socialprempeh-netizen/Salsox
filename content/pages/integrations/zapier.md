---
title: "Zapier e-signature integration: where {site} stands"
description: "{site} has no native Zapier app yet. What works today: a Zap triggered by the signed-document email, step by step, and what the native app will add."
h1: "Zapier and {site}: automating e-signatures today"
lede: "A native {site} app for Zapier is in development, not available yet. You can still automate the moment a document is signed, with a Zap that starts from the completion email. Here is how, and where it falls short."
primaryKeyword: "zapier esignature integration"
aliases: ["zapier e-signature", "esignature zapier", "zapier document signing", "zapier signed document trigger"]
published: 2026-10-24
updated: 2026-10-24
breadcrumb: "Zapier"
integration: { name: "Zapier", status: "in-development", url: "https://zapier.com" }
faq:
  - q: "Is there a {site} app in the Zapier directory?"
    a: "Not yet. A native app is in development. Until it ships, the reliable route is a Zap whose trigger is the completion email {site} sends when everyone has signed."
  - q: "Can a Zap send a document for signature through {site}?"
    a: "No. Sending needs a public API, which {site} does not have today, so documents are sent from the dashboard by a person. The workaround on this page only reacts to documents that finish."
  - q: "Does the email trigger see the signed PDF?"
    a: "It sees the email, which carries the document title and a link to download the signed PDF. A Zap can pass that link on, for example into a spreadsheet row or a chat message."
related: ["/esignature-api", "/integrations/make", "/integrations/gmail", "/document-tracking", "/pricing"]
---

## The short answer

Zapier connects apps through triggers ("a new row was added") and actions ("send a message"). For an e-signature tool, the useful trigger is "a document was signed", and the useful action is "send this document for signature". {site} offers neither as a native Zapier app today. Both depend on a public API and webhooks, and as the [eSignature API page](/esignature-api) explains, {site} does not have those yet. A Zapier app is being built on top of them; this page will change when it ships, and not before.

## What you can automate today

{site} already sends an email at the moments that matter, and Zapier can read email. When the last person signs, everyone on the document receives a message with the subject line *"Title" is signed by everyone* and a button to download the signed PDF. When someone refuses, the sender receives *Name declined to sign "Title"*. Those messages are predictable enough to start a Zap.

## Building the Zap

1. In Zapier, create a Zap and choose **Gmail** (or **Microsoft Outlook**) as the trigger app, with the event **New Email Matching Search**.
2. Use a search that only matches completion messages, such as `subject:"is signed by everyone"`. Add `from:` with the address your {site} emails come from, so a client quoting the phrase cannot set it off.
3. Test the trigger with a document you have just finished, so Zapier has a real example to map fields from.
4. Add a **Formatter** step to pull the document title out of the subject line: the text between the quotation marks.
5. Add the action you want: a new row in Google Sheets with the title and the date, a message in a Slack channel, a task in your project tool, or a deal stage change in your CRM.

A second Zap built the same way on *declined to sign* can alert you to refusals the moment they happen, which is often when a quick call saves the deal.

## Where the email route falls short

It is honest automation, not a real integration. It fires when the whole document is complete, not as each person signs. It knows the title, not the signer list or the field values. It needs a mailbox Zapier can read, so the Zap belongs to whoever owns that inbox. And it cannot start anything in {site}: every document is still prepared and sent from the dashboard.

## What the native app will add

The planned app covers the parts email cannot: triggers for each signature, decline and expiry with the signer's details; an action to send a saved template to a new recipient; and the signed PDF itself as a file other steps can attach. If there is a workflow you would automate first, tell us through the contact page: the order in which triggers and actions are built follows what people ask for.

## In the meantime

Most teams who ask for Zapier want to know when paperwork is finished without checking. Until the app exists, the [document tracking](/document-tracking) page in the dashboard shows who has opened and signed each document, and the completion email reaches everyone the moment it is done.
