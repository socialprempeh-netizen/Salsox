---
title: "Make (Integromat) e-signature automation with {site}"
description: "No native {site} module for Make yet. How to build a scenario today from {site}'s emails with a mailhook or Gmail module, and its limits."
h1: "Make scenarios for e-signatures: what you can build with {site} now"
lede: "{site} does not have a Make module yet; one is in development. Make can still watch for signed documents through the emails {site} sends, with either a mailhook address or a Gmail module. This page shows both."
primaryKeyword: "make esignature automation"
aliases: ["make.com esignature", "integromat esignature", "make scenario document signing", "make mailhook signed document"]
published: 2026-10-24
updated: 2026-10-24
breadcrumb: "Make"
integration: { name: "Make", status: "in-development", url: "https://www.make.com" }
faq:
  - q: "Is there a {site} module in Make?"
    a: "Not yet. It is in development and depends on a public API and webhooks, which {site} does not offer today. Scenarios can start from {site}'s notification emails in the meantime."
  - q: "Which is better, a mailhook or the Gmail module?"
    a: "A mailhook runs as soon as the email arrives and does not need anyone's inbox, but you must forward messages to it. The Gmail module needs no forwarding rule but checks the inbox on a schedule."
  - q: "Can a scenario read who signed?"
    a: "Not reliably. The completion email names the document and links to the signed PDF; the list of signers and their times is in the audit trail in the dashboard and, on the Business plan, on the certificate page of the PDF."
related: ["/integrations/zapier", "/integrations/gmail", "/esignature-api", "/document-workflows", "/esignature-audit-trail"]
---

## Why there is no module yet

A Make module talks to an app through its API: it asks for data, sends commands, and receives instant triggers through webhooks. {site} has neither a public API nor webhooks today, so there is nothing for a module to call. The module is planned on top of both. Until then, the dependable signal {site} produces is email, and Make is good at email.

## Option one: a mailhook

Make can give you an email address of its own, called a mailhook, that starts a scenario whenever a message lands there.

1. Create a scenario and add **Mailhook** as the first module. Make shows an address ending in `@hook.eu1.make.com` or similar.
2. In your own mailbox, add a rule that forwards messages whose subject contains *is signed by everyone* to that address. Restrict the rule to the address {site} sends from.
3. Finish a test document so a real message reaches the hook, then click **Run once** to capture its structure.
4. Use a **Text parser** module with a pattern match to take the document title from between the quotation marks in the subject, and the download link from the body.
5. Route the result where it is needed: an Airtable record, a Google Sheets row, a Trello card moved to "Signed", a Slack or Teams message.

Because the mailhook fires the instant the forwarded email arrives, this is the closest thing to a real-time trigger available today.

## Option two: the Gmail module

If you would rather not set up forwarding, start the scenario with **Gmail > Watch emails**, filtered on the same subject text and sender. The scenario runs on Make's schedule, every fifteen minutes on most plans, so expect a short delay. Everything after the trigger is the same as above.

## Routing by outcome

Add a **Router** after the trigger and you can handle different messages in one scenario: completion goes to your records, *declined to sign* goes to the person who owns the deal, *Signing links for "Title" expired* creates a follow-up task. Each path filters on the subject line.

## Limits to plan around

Email-based scenarios see what the email says and nothing more. They cannot start a signing request, they do not know the individual signers, and a change to an email's wording would break the parser, so keep your patterns loose. Treat them as a bridge, not a foundation.

## What a module will change

The planned module brings instant triggers per signature and per document, actions to send a template to new recipients, and the signed PDF as a file. If your scenario needs something specific, describe it on the contact page; requests shape what is built first.
