---
title: "Free Medical Records Release Form Template"
description: "A free medical records release authorisation: which records, released to whom, for what purpose, until when, and how the patient can revoke it."
h1: "Medical records release form template"
lede: "Get a patient's written authorisation before sending their records to someone else: which records, to whom, why, until when, and how they can withdraw their permission. The patient signs on their phone."
keyword: "medical records release form"
category: forms
type: form
industries: ["healthcare", "legal"]
teams: []
roles:
  - { id: "patient", label: "Patient" }
  - { id: "practice", label: "Practice", you: true }
variables:
  "Practice name": "Lakeside Family Medicine"
  "Practice address": "550 Lakeshore Drive, Burlington, VT 05401, USA"
  "Patient name": "Robert Chen"
  "Date of birth": "14 March 1981"
  "Recipient name": "Dr. Alicia Moreno, Green Mountain Orthopaedics"
  "Recipient address": "75 College Street, Burlington, VT 05401, USA"
  "Records described": "office visit notes, imaging reports and X-ray images relating to the right knee, from 1 January 2025 to today"
  "Purpose": "continuing care with a specialist"
  "Delivery method": "secure electronic transfer to the recipient's practice"
  "Expiry": "90 days from the date signed, or when the records have been sent, whichever comes first"
  "Records contact": "records@lakesidefm.example"
about: |
  Medical records are among the most protected personal information there is. Before a practice sends them to anyone outside the treating team, such as a new doctor, an insurer, a lawyer or an employer, it usually needs the patient's written authorisation, and the authorisation has to be specific: which records, to whom, for what purpose, and for how long.

  This template covers those elements and the statements patient privacy laws commonly require: that the patient may revoke the authorisation in writing, that treatment does not depend on signing it unless the law allows an exception, and that information sent to a recipient who is not bound by health privacy rules may no longer be protected by them. It includes optional check boxes for especially sensitive records, which many laws require to be authorised separately.

  The exact requirements differ by country and state, for example under HIPAA in the United States or the GDPR in Europe, so have your privacy officer review the wording once before you use it.
faq:
  - q: "Can the patient sign on their phone?"
    a: "Yes. Electronic signatures are generally accepted for authorisations like this, and {site} records who signed, when and from what device, which supports the record if it is ever questioned."
  - q: "Can the patient withdraw the authorisation?"
    a: "Yes, in writing, at any time. Records already sent before the practice received the withdrawal cannot be recalled, as the form explains."
  - q: "Why are some record types listed separately?"
    a: "Many laws give extra protection to records about mental health, substance use treatment, HIV status and genetic testing, and require them to be authorised specifically."
published: 2026-10-24
updated: 2026-10-24
---

# Authorisation to Release Medical Records

**Practice:** [Practice name], [Practice address]

## 1. Patient

Name: [Patient name]
Date of birth: [Date of birth]

## 2. Recipient

I authorise the practice to release my records to: [Recipient name], [Recipient address].

## 3. Records to be released

[Records described].

The following especially sensitive information is released only if I write "include" beside it; anything else, or a blank, means it is excluded:

- Mental health records: [[text:patient]]
- Substance use treatment records: [[text:patient]]

Patient initials confirming these choices: [[initials:patient]]

## 4. Purpose

The records are released for: [Purpose].

## 5. Delivery

The records will be sent by [Delivery method].

## 6. Expiry

This authorisation expires [Expiry].

## 7. Your rights

- You may revoke this authorisation at any time by writing to [Records contact]. Revoking it does not affect records already released.
- Your treatment, payment or eligibility for benefits does not depend on signing this form.
- Once released, your information may no longer be protected by health privacy law if the recipient is not subject to it.
- You may ask for a copy of this signed form.

## Signatures

Patient or legal representative: [[signature:patient]]   Date: [[date:patient]]
Name: [[name:patient]]

Received for the practice: [[signature:practice]]   Date: [[date:practice]]
