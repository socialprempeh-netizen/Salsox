---
title: "Free Data Processing Agreement (DPA) Template"
description: "A free data processing agreement template for GDPR-style processor terms: instructions, security, sub-processors, breaches, transfers and deletion."
h1: "Data processing agreement (DPA) template"
lede: "When a supplier handles personal data for you, data protection law expects a written contract with specific terms. This DPA covers them: instructions, confidentiality, security, sub-processors, breaches and deletion."
keyword: "data processing agreement template"
category: contracts
type: agreement
industries: ["software", "marketing", "healthcare", "professional-services", "recruitment"]
teams: ["legal", "customer-success"]
roles:
  - { id: "processor", label: "Processor", you: true }
  - { id: "controller", label: "Controller" }
variables:
  "Agreement date": "24 October 2026"
  "Controller name": "Fernhill Dental Group Ltd"
  "Controller address": "3 Station Approach, Bristol BS1 6QF, United Kingdom"
  "Processor name": "Appointly Software Ltd"
  "Processor address": "45 Queen Street, Edinburgh EH2 3NH, United Kingdom"
  "Main agreement": "the Appointly subscription agreement dated 1 October 2026"
  "Processing purpose": "providing online appointment booking, reminders by email and SMS, and patient check-in"
  "Data subjects": "the controller's patients and prospective patients, and the controller's staff who use the service"
  "Personal data types": "name, contact details, date of birth, appointment history and notes the controller chooses to add"
  "Special category data": "health information contained in appointment notes"
  "Processing duration": "the term of the main agreement, plus up to 30 days for deletion"
  "Security measures": "encryption in transit and at rest, single sign-on with two-factor authentication for staff, role-based access, daily encrypted backups and annual penetration testing"
  "Sub-processors": "Amazon Web Services EMEA SARL for hosting in Ireland, and Twilio Inc. for SMS delivery"
  "Breach notice period": "48 hours"
  "Transfer safeguards": "the UK International Data Transfer Addendum to the EU standard contractual clauses"
  "Governing law": "England and Wales"
about: |
  Under the GDPR, the UK GDPR and laws modelled on them, a business that uses a supplier to handle personal data on its behalf must have a written contract with that supplier covering a specific list of points. The business is the controller, deciding why and how the data is used; the supplier is the processor, acting only on the controller's instructions. That contract is the data processing agreement.

  This template covers the terms such laws require: processing only on documented instructions, confidentiality of staff, security measures, conditions for using sub-processors, help with data subjects' requests, notice of breaches, deletion or return at the end, and making information available for audits. It also records the details regulators expect to see: what data, about whom, for what purpose and for how long.

  It is drafted from the processor's side as a supplier would send it with its main contract, but works either way. Describe your security measures and sub-processors accurately; a DPA that promises controls you do not have creates liability rather than reducing it.
faq:
  - q: "Do I need a DPA?"
    a: "If you are subject to the GDPR or UK GDPR and a supplier processes personal data for you, such as a payroll provider, a CRM or a booking system, yes: the law requires a written contract with these terms."
  - q: "Who signs the DPA, the controller or the processor?"
    a: "Both. It binds the processor to the controller's instructions and records the controller's choices, so each party signs."
  - q: "What about transfers outside the UK or EU?"
    a: "Section 8 requires a lawful transfer mechanism, such as the standard contractual clauses or a transfer addendum, whenever data leaves the UK or EU. Name the one you rely on."
published: 2026-10-24
updated: 2026-10-24
---

# Data Processing Agreement

This agreement is made on [Agreement date] between [Controller name], of [Controller address] (the "Controller"), and [Processor name], of [Processor address] (the "Processor"). It forms part of [Main agreement] (the "Main Agreement").

## 1. Details of the processing

| | |
|---|---|
| Purpose | [Processing purpose] |
| Data subjects | [Data subjects] |
| Types of personal data | [Personal data types] |
| Special category data | [Special category data] |
| Duration | [Processing duration] |

## 2. Instructions

The Processor will process personal data only on the Controller's documented instructions, including those in the Main Agreement, unless the law requires otherwise, in which case it will tell the Controller first unless the law forbids it. The Processor will tell the Controller if it believes an instruction breaks data protection law.

## 3. Confidentiality

The Processor will ensure everyone authorised to process the personal data is bound by a duty of confidentiality.

## 4. Security

The Processor will implement appropriate technical and organisational measures to protect the personal data, including [Security measures], and will keep them under review.

## 5. Sub-processors

The Controller authorises the following sub-processors: [Sub-processors]. The Processor will give the Controller at least 30 days' notice of any new sub-processor, during which the Controller may object on reasonable grounds. The Processor will impose the same data protection obligations on each sub-processor and remains liable for their performance.

## 6. Assistance

Taking into account the nature of the processing, the Processor will help the Controller respond to requests from data subjects exercising their rights, and with security, breach notification, impact assessments and consultation with regulators.

## 7. Personal data breaches

The Processor will notify the Controller without undue delay, and in any case within [Breach notice period], after becoming aware of a personal data breach, with the information the Controller needs to meet its own obligations.

## 8. International transfers

The Processor will not transfer personal data outside the United Kingdom or the European Economic Area unless a lawful safeguard is in place, namely [Transfer safeguards].

## 9. End of processing

When the Main Agreement ends, the Processor will, at the Controller's choice, delete or return all personal data and delete existing copies, unless the law requires it to keep them.

## 10. Audits

The Processor will make available the information needed to demonstrate compliance with this agreement and allow for, and contribute to, audits by the Controller or an auditor it appoints, on reasonable notice and no more than once a year unless a breach has occurred.

## 11. General

If this agreement and the Main Agreement conflict on data protection, this agreement prevails. It is governed by the law of [Governing law].

## Signatures

For the Processor: [[signature:processor]]   Date: [[date:processor]]
Name: [[name:processor]]

For the Controller: [[signature:controller]]   Date: [[date:controller]]
Name: [[name:controller]]
