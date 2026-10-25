---
title: "Make (Integromat) e-signature automation with {site}"
description: "No native {site} module for Make yet. How to build a real-time scenario today from {site} webhooks with Make's Custom webhook, and its limits."
h1: "Make scenarios for e-signatures: what you can build with {site} now"
lede: "{site} does not have a Make module yet; one is in development. Make can already start a scenario the moment a document is sent, viewed, signed or completed, through {site} webhooks and Make's Custom webhook module. This page shows how, and the email route for when webhooks are not an option."
primaryKeyword: "make esignature automation"
aliases: ["make.com esignature", "integromat esignature", "make scenario document signing", "make mailhook signed document"]
published: 2026-10-24
updated: 2026-10-25
breadcrumb: "Make"
integration: { name: "Make", status: "in-development", url: "https://www.make.com" }
faq:
  - q: "Is there a {site} module in Make?"
    a: "Not yet. It is in development. In the meantime a scenario can start from {site} webhooks through Make's Custom webhook module, in real time, with each signer's details."
  - q: "Which is better, a webhook or an email trigger?"
    a: "The webhook. It fires on every event, not only completion, carries the signer list and timestamps as fields, and does not depend on the wording of an email. Use email only where you cannot add an endpoint."
  - q: "Can a scenario read who signed?"
    a: "Yes, from a webhook: each delivery lists every recipient with their name, email, status and the time they viewed and signed. The signed PDF itself is not attached yet; the payload links to the document."
related: ["/integrations/zapier", "/integrations/gmail", "/esignature-api", "/document-workflows", "/esignature-audit-trail"]
---

## Why there is no module yet

A Make module talks to an app through its API: it receives instant triggers, asks for data and sends commands. {site} now sends webhooks for every document event, and has an API for integrations to subscribe to them, so the trigger half exists. A module also needs actions, such as sending a template, and those need an API to create documents, which {site} does not have yet. Until the module ships, Make's own **Custom webhook** module catches {site}'s webhooks directly.

## Build a scenario from webhooks

1. Create a scenario and add **Webhooks → Custom webhook** as the first module. Select **Add**, name it, and copy the address Make shows.
2. In {site}, open Dashboard → Developers, paste the address under Webhooks, and tick the events this scenario should handle.
3. In Make, select **Redetermine data structure**, then **Send test** on the endpoint in {site}, so Make learns the fields. Sample deliveries carry `"test": true`.
4. Add a **Router** with one path per event, filtering on the `event` field: `document.completed` to your records, `document.viewed` to the deal's owner, `document.signed` to a progress log.
5. Route the result where it is needed: an Airtable record, a Google Sheets row, a Trello card moved to "Signed", a Slack or Teams message.

Each delivery is signed. If the scenario does anything sensitive, check the `Webhook-Signature` header as the [webhooks and API reference](/resources/help/webhooks-and-api) describes.

## Without webhooks: the email route

If you cannot add an endpoint, a scenario can still start from the email {site} sends when everyone has signed. Add **Mailhook** as the first module, forward messages whose subject contains *is signed by everyone* to its address, and take the title from between the quotation marks with a **Text parser**. Or start from **Gmail > Watch emails**, which runs on Make's schedule. Both see only what the email says and break if its wording changes, so treat them as a fallback.

## Limits to plan around

Webhook scenarios cannot start a signing request in {site}: documents are still sent from the dashboard. Each scenario needs its address pasted into {site} by hand. And the signed PDF arrives as a link to the document, not a file.

## What a module will change

The planned module connects your account once with an API key, subscribes to events itself, adds actions to send a template to new recipients, and brings the signed PDF as a file. If your scenario needs something specific, describe it on the contact page; requests shape what is built first.