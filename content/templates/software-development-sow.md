---
title: "Free Software Development SOW Template"
description: "A free software development statement of work: scope and features, milestones, acceptance testing, change requests, team, environments and fees."
h1: "Software development statement of work (SOW) template"
lede: "Define a software build precisely enough to deliver and accept it: the features in and out of scope, milestones, how each is tested and accepted, how changes are requested, and how fees follow the milestones."
keyword: "software development statement of work"
category: sow
type: agreement
industries: ["software", "finance", "healthcare", "retail"]
teams: ["legal", "customer-success"]
roles:
  - { id: "supplier", label: "Supplier", you: true }
  - { id: "client", label: "Client" }
variables:
  "SOW number": "SOW-07"
  "SOW date": "24 October 2026"
  "Supplier name": "Kernel and Co. Software Ltd"
  "Client name": "Harvest Grocers Inc."
  "Master agreement": "the Master Services Agreement dated 3 March 2026"
  "Project objective": "a mobile app for iOS and Android that lets customers order groceries for same-day pickup at any of the client's 14 stores"
  "In scope": "customer accounts and sign-in; product search and browsing from the client's existing catalogue API; basket and checkout with card payment through the client's Stripe account; pickup slot selection; order status notifications; and an admin screen for store staff to mark orders ready"
  "Out of scope": "delivery to customers' homes, loyalty points, changes to the catalogue API, and content entry"
  "Milestone one": "clickable prototype and approved designs, by 30 November 2026, EUR 18,000"
  "Milestone two": "working beta in test app stores with all in-scope features, by 15 February 2027, EUR 54,000"
  "Milestone three": "public launch in both app stores, by 31 March 2027, EUR 28,000"
  "Acceptance period": "10 business days"
  "Client responsibilities": "access to the catalogue API and a test Stripe account by 9 November 2026, a named product owner available for a weekly review, and app store developer accounts"
  "Team": "a delivery lead, two mobile engineers, a backend engineer and a designer"
  "Warranty period": "60 days after launch"
about: |
  A statement of work turns "build us an app" into something that can be delivered, tested and paid for. It sits under a master services agreement, which covers the legal terms, and describes one project: what will be built, what will not, when each milestone is due, how the client checks it, and what it costs.

  This template is built around acceptance, the step most often skipped. Each milestone has a set period for the client to test it against the scope, and silence after that period counts as acceptance, so a milestone cannot stay open indefinitely. Defects found in testing are fixed at no charge; new ideas go through a written change request with their cost and schedule impact before anyone starts work.

  The out-of-scope list is as important as the in-scope one. Writing down what will not be built is the cheapest way to avoid disputes about what was promised.
faq:
  - q: "What is the difference between a SOW and a contract?"
    a: "A master agreement sets the legal terms for the relationship, such as liability, ownership and payment terms. A SOW describes one specific project under it. One master agreement can have many SOWs."
  - q: "What if the client wants a new feature mid-project?"
    a: "It goes through the change request process in section 6: the supplier estimates the cost and schedule impact, and work starts only once both sides sign the change."
  - q: "When is a milestone accepted?"
    a: "When the client confirms it meets the scope, or when the acceptance period ends without the client reporting defects that stop it meeting the scope."
published: 2026-10-24
updated: 2026-10-24
---

# Statement of Work [SOW number]

**Date:** [SOW date]
**Supplier:** [Supplier name]
**Client:** [Client name]

This statement of work is issued under [Master agreement]. If they conflict, the master agreement prevails, except where this SOW expressly says otherwise.

## 1. Objective

[Project objective].

## 2. Scope

**In scope:** [In scope].

**Out of scope:** [Out of scope].

## 3. Milestones and fees

| Milestone | Deliverable, date and fee |
|---|---|
| 1 | [Milestone one] |
| 2 | [Milestone two] |
| 3 | [Milestone three] |

Each milestone fee is invoiced on acceptance of that milestone.

## 4. Acceptance

The Client will test each milestone against the scope within [Acceptance period] of delivery, and either accept it or list the defects that stop it meeting the scope. The Supplier will fix listed defects and redeliver. A milestone is accepted when the Client confirms it, or when the acceptance period ends without a list of defects.

## 5. Client responsibilities

The Client will provide [Client responsibilities]. Delays in these move the milestone dates by at least the same time.

## 6. Change requests

Either party may propose a change in writing. The Supplier will estimate its effect on fees and dates within 5 business days. A change takes effect only when both parties sign it.

## 7. Team

The Supplier will provide [Team]. The Supplier may change team members with notice, keeping equivalent skills.

## 8. Warranty

For [Warranty period], the Supplier will fix, at no charge, defects that stop the app working as described in the scope.

## Signatures

For the Supplier: [[signature:supplier]]   Date: [[date:supplier]]
Name: [[name:supplier]]

For the Client: [[signature:client]]   Date: [[date:client]]
Name: [[name:client]]
