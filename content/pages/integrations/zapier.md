---
title: "Zapier e-signature integration: where {site} stands"
description: "{site} has no native Zapier app yet. What works today: a Zap started by {site} webhooks through Webhooks by Zapier, step by step, and its limits."
h1: "Zapier and {site}: automating e-signatures today"
lede: "A native {site} app for Zapier is in development, not available yet. You can already start a Zap the moment a document is sent, viewed, signed or completed, with {site} webhooks and Zapier's own webhook trigger. Here is how, and where it falls short."
primaryKeyword: "zapier esignature integration"
aliases: ["zapier e-signature", "esignature zapier", "zapier document signing", "zapier signed document trigger"]
published: 2026-10-24
updated: 2026-10-25
breadcrumb: "Zapier"
integration: { name: "Zapier", status: "in-development", url: "https://zapier.com" }
faq:
  - q: "Is there a {site} app in the Zapier directory?"
    a: "Not yet. A native app is in development. Until it ships, the reliable route is Webhooks by Zapier: {site} sends each document event to the Zap's Catch Hook URL as it happens."
  - q: "Can a Zap send a document for signature through {site}?"
    a: "Yes, with Webhooks by Zapier's Custom Request action and a {site} API key: the Zap posts the document, a PDF link or a template, and the recipients to the API, and the document is sent as it would be from the dashboard. The [Zapier and Make guide](/resources/help/connect-zapier-or-make) shows the request. A native app will make this a form to fill in."
  - q: "What does the webhook trigger see?"
    a: "The event, the document's title, status and dates, every recipient's name, email and signing status, and a link to the document. The signed PDF itself is not attached yet: a Zap passes the link on."
related: ["/esignature-api", "/integrations/make", "/integrations/gmail", "/document-tracking", "/pricing"]
---

## The short answer

Zapier connects apps through triggers ("a new row was added") and actions ("send a message"). For an e-signature tool, the useful trigger is "a document was signed", and the useful action is "send this document for signature". {site} has no native Zapier app yet, but the trigger half works today: {site} sends a webhook for each document event, and Zapier's own **Webhooks by Zapier** app can catch it. The action half works too: {site}'s API can send a document for signature, and Zapier's Custom Request action can call it, as the [eSignature API page](/esignature-api) explains.

## What you can automate today

Every {site} account can add webhook endpoints under Dashboard → Developers. Each one receives a signed JSON message when a document is sent, first viewed, signed by a recipient or completed by everyone, and when a signer pays through Sign & Pay. Point one at a Zapier Catch Hook and each of those moments can start a Zap, with the document's title, every signer's name and status, and a link to the document as fields to map.

## Building the Zap

1. In Zapier, create a Zap and choose **Webhooks by Zapier** as the trigger app, with the event **Catch Hook**. Copy the URL Zapier shows.
2. In {site}, open Dashboard → Developers, paste that URL under Webhooks, and tick the events this Zap should react to, such as `document.completed`.
3. Select **Send test** on the new endpoint, then **Test trigger** in Zapier, so Zapier has an example to map fields from. Sample deliveries carry `"test": true`.
4. Add a **Filter** step on the `event` field if the endpoint sends more than one event and this Zap should act on one.
5. Add the action you want: a row in Google Sheets with the title and `completed_at`, a message in a Slack channel, a task in your project tool, or a deal stage change in your CRM.

A second endpoint and Zap on `document.viewed` tells you the moment a client opens a contract, which is often when a quick call saves the deal. The fields are listed in the [webhooks and API reference](/resources/help/webhooks-and-api).

## Where the webhook route falls short

It is a real-time trigger, set up by hand. Each Zap needs its URL pasted into {site}, rather than connecting your account once inside Zapier. It cannot start anything in {site}: every document is still prepared and sent from the dashboard. And the signed PDF arrives as a link to the document, not as a file other steps can attach.

## What the native app will add

The planned app connects your account once with an API key and subscribes to events itself, so no URL is pasted by hand. It adds an action to send a saved template to a new recipient, and the signed PDF as a file. If there is a workflow you would automate first, tell us through the contact page: the order in which triggers and actions are built follows what people ask for.

## Without webhooks

If you cannot add an endpoint, the older route still works: {site} emails everyone when the last person signs, with the subject *"Title" is signed by everyone*, and a Zap can start from **Gmail → New Email Matching Search** on that subject. It fires only on completion and sees only the title, so prefer the webhook route where you can.