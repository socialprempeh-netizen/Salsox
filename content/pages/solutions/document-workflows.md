---
title: "Document signing workflows: order, approvers and copies"
description: "Set up document signing workflows: parallel or sequential signing, approvers before signers, copies for people who only need to see it, expiry and reminders."
h1: "Document signing workflows: who signs, in what order, and who just needs a copy"
lede: "Most documents need more than one person: a manager who approves before the client signs, two parties who sign in turn, an accountant who only needs a copy. A signing workflow is that order, written into the document."
primaryKeyword: "document signing workflow"
aliases: ["esignature workflow", "document workflows", "sequential signing", "signing order", "document approval before signing"]
published: 2026-10-15
updated: 2026-10-15
breadcrumb: "Signing workflows"
benefits:
  - title: "Signing order"
    body: "Everyone at once, or one after another, so each person signs only when it is their turn."
  - title: "Approvers"
    body: "Someone who approves a document before it goes on, without signing it themselves."
  - title: "Copies"
    body: "People who should see the document or receive the signed copy, without having to act."
faq:
  - q: "Which plan includes signing order and approvers?"
    a: "The Business plan, $19 a month. On every plan, all signers can sign at the same time and recipients can be added as copies."
  - q: "What happens if an approver declines?"
    a: "The document stops, the sender is told, and the approver's reason is shown on the document's page and recorded in its audit trail."
  - q: "Can a workflow branch depending on answers?"
    a: "No. {site} has no conditional routing; the order is fixed when you send. Larger platforms offer conditional workflows."
related: ["/blog/document-approval-workflows", "/document-tracking", "/business-esignature", "/esignature-for/legal-teams", "/esignature-for/hr", "/pricing"]
---

## The roles in a signing workflow

Each person on a {site} document has a role:

- **Signer**: fills fields and signs. Most recipients are signers.
- **Approver**: reviews and approves the document before it continues, without placing a signature. Useful for a manager, a partner or a finance lead who must agree before a client sees it. (Business plan.)
- **Viewer**: can open and read the document but has nothing to do.
- **Copy**: receives the completed, signed document, for example your accountant or a co-owner.

## Parallel or sequential

By default everyone signs at the same time: each recipient gets their link as soon as you send, and the document completes when the last person signs. That is the fastest option and suits most two-party agreements.

Some documents must be signed in a fixed order. A contract your director signs only after the client has, an offer approved by HR before the candidate sees it, a lease signed by every tenant before the landlord countersigns. With sequential signing on the Business plan, you set the order, and each person is invited only when the one before them has finished. Everyone can see where the document is from its page.

## Expiry and reminders

Every document can expire, 30 days by default, after which unsigned links stop working, and anyone who has not signed is reminded automatically every three days. In a sequential workflow the reminders follow the order: only the person whose turn it is gets nudged. See [document tracking](/document-tracking) for how status and reminders work.

## Declines and corrections

Any signer or approver can decline, giving a reason. The document stops, you are told, and the reason is shown on its page and kept in the audit trail. If a recipient's email was wrong, you correct it on the document; their link is reissued and the workflow continues from where it was.

## Workflows with payment

On the Business plan a workflow can include a payment: choose which signer pays, and they pay as part of signing. In a sequential workflow the payer can be anyone in the order; for a deposit, it is usually the client, last. See [Sign & Pay](/sign-and-pay).

## Setting one up

Upload the document, add each recipient with their role, choose parallel or sequential and set the order, place each signer's fields, and send. For a recurring workflow, such as an offer letter approved by a manager then signed by the candidate, keep the order the same each time; the guide to [document approval workflows](/blog/document-approval-workflows) walks through common patterns.

## What it does not do

{site} workflows are a fixed list of people in a fixed order. There is no conditional routing (sending to different people depending on answers), no parallel branches inside a sequence, no automated steps after signing, and no integration with other systems to start a workflow automatically. Platforms with workflow builders and an API handle those cases.
