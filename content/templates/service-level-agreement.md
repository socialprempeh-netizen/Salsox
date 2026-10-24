---
title: "Free Service Level Agreement (SLA) Template"
description: "A free SLA template: uptime target and how it is measured, support hours, response times by severity, maintenance windows and service credits."
h1: "Service level agreement (SLA) template"
lede: "Turn 'reliable service' into numbers both sides can check: an uptime target and how it is measured, support hours, response times by severity, planned maintenance, and the credit owed when targets are missed."
keyword: "service level agreement template"
category: contracts
type: agreement
industries: ["software", "professional-services", "manufacturing"]
teams: ["customer-success", "sales", "legal"]
roles:
  - { id: "provider", label: "Service provider", you: true }
  - { id: "customer", label: "Customer" }
variables:
  "Agreement date": "24 October 2026"
  "Provider name": "Stackhaven Cloud Inc."
  "Customer name": "Meridian Logistics Corp."
  "Main agreement": "the Master Services Agreement dated 1 September 2026"
  "Service description": "the Stackhaven managed database platform, including the web console and API"
  "Uptime target": "99.9%"
  "Measurement method": "external checks every minute from three regions; a minute counts as unavailable when two regions fail to reach the service"
  "Support hours": "24 hours a day, 7 days a week for Severity 1; 8:00 to 18:00 Eastern Time on business days for other severities"
  "Support channels": "the support portal, support@stackhaven.example, and a phone line for Severity 1"
  "Maintenance window": "Sundays from 02:00 to 04:00 UTC, announced at least 5 days in advance"
  "Credit for 99.0 to 99.9": "10% of the monthly fee for the affected service"
  "Credit for 95.0 to 99.0": "25% of the monthly fee for the affected service"
  "Credit below 95.0": "50% of the monthly fee for the affected service"
  "Credit claim deadline": "30 days after the end of the month"
about: |
  A service level agreement sets measurable promises for an ongoing service, usually software or IT support, and what the customer receives when a promise is broken. Without one, "high availability" and "fast support" mean whatever each side assumes. With one, a missed target has an agreed, proportionate consequence instead of an argument.

  This template defines availability and exactly how it is measured, excludes the outages that are fair to exclude, such as announced maintenance or problems the customer caused, and sets response times by severity with clear definitions of each level. Service credits step up as availability falls, and the customer must claim them within a set time.

  An SLA usually sits under a main services agreement, which covers price, liability and term; this one says it does. Set targets you can meet with margin, and measure them the way the SLA says you will: published uptime figures that do not match the contract are a common source of disputes.
faq:
  - q: "What uptime should an SLA promise?"
    a: "It depends on the service and its architecture. 99.9% allows about 43 minutes of downtime a month; 99.99% allows about 4. Promise what your history shows you can deliver, not what competitors advertise."
  - q: "Are service credits the customer's only remedy?"
    a: "This template makes them the sole remedy for missed availability, which is common, but leaves the main agreement's termination rights for repeated failures. Adjust that balance to what you negotiate."
  - q: "Does an SLA replace a services agreement?"
    a: "No. It adds measurable service levels to a main agreement that covers fees, liability, data and term. This template refers to that agreement."
published: 2026-10-24
updated: 2026-10-24
---

# Service Level Agreement

This agreement is made on [Agreement date] between [Provider name] (the "Provider") and [Customer name] (the "Customer"). It forms part of [Main agreement] and applies to [Service description] (the "Service").

## 1. Availability

The Provider will make the Service available at least [Uptime target] of the time in each calendar month. Availability is measured by [Measurement method].

Availability is calculated as the minutes in the month, less unavailable minutes, divided by the minutes in the month. The following are not counted as unavailable:

- planned maintenance during [Maintenance window];
- problems caused by the Customer's systems, configuration or use in breach of the main agreement;
- events outside the Provider's reasonable control, such as a failure of the public internet; and
- suspension of the Service permitted by the main agreement.

## 2. Support

Support is available [Support hours], through [Support channels].

| Severity | Meaning | First response within |
|---|---|---|
| 1 | The Service is down or unusable for all users | 30 minutes |
| 2 | A major function fails with no workaround | 2 hours |
| 3 | A function fails and a workaround exists | 1 business day |
| 4 | A question or a minor issue | 2 business days |

The Provider will keep working on Severity 1 issues continuously until the Service is restored, and give updates at least every hour.

## 3. Service credits

If availability in a month falls below the target, the Customer is entitled to a credit against the next invoice:

| Monthly availability | Credit |
|---|---|
| 99.0% to below [Uptime target] | [Credit for 99.0 to 99.9] |
| 95.0% to below 99.0% | [Credit for 95.0 to 99.0] |
| Below 95.0% | [Credit below 95.0] |

The Customer must request a credit within [Credit claim deadline]. Credits are the Customer's sole financial remedy for missed availability, but do not limit the termination rights in the main agreement.

## 4. Reporting

On request, the Provider will give the Customer a monthly report of availability and of support tickets by severity and response time.

## 5. Changes

The Provider may not reduce the service levels during the current term of the main agreement without the Customer's written consent.

Customer initials: [[initials:customer]]

## Signatures

For the Provider: [[signature:provider]]   Date: [[date:provider]]
Name: [[name:provider]]

For the Customer: [[signature:customer]]   Date: [[date:customer]]
Name: [[name:customer]]
