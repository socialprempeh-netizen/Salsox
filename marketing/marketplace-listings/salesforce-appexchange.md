# Salesforce AppExchange: listing draft

**Status: draft, not submittable yet.** AppExchange lists solutions from Salesforce partners that pass a security review. Salsox needs, first: enrolment in the Salesforce partner program; the integration itself, most simply a managed package with a Lightning component and a connected app (OAuth) that calls the Salsox public API; and a passed security review of both the package and the Salsox endpoints it calls.

Requirements and fees: [ISVforce security review fees](https://developer.salesforce.com/docs/atlas.en-us.244.0.packagingGuide.meta/packagingGuide/security_review_fees.htm) and the [review cycle](https://developer.salesforce.com/docs/atlas.en-us.244.0.packagingGuide.meta/packagingGuide/security_review_complete_the_review_cycle.htm). Per those pages, the review fee is waived for free solutions and charged for paid or freemium ones; results take about three to four weeks. Confirm current fees in the Partner Console before you plan: they have changed between guide versions.

This is the largest of the three builds. Do it after Zapier and HubSpot.

**Update 2026-10-25:** the Salsox endpoints a package would call have started to exist: signed webhooks for document events and an API-key REST API at `/api/v1` (documented at `/resources/help/webhooks-and-api`). The package still needs OAuth for its connected app, an API to send documents from a Salesforce record, and the security review, which will scan these endpoints: the webhook sender already refuses private addresses and does not follow redirects, which reviewers check for.

## Listing fields

**Listing title:** Salsox e-Signatures for Salesforce

**Logo:** `assets/logo-800.png`

**Tagline:**

> Send agreements for e-signature from any Salesforce record, signed on any phone.

**Description:**

> Salsox brings mobile-first e-signatures into Salesforce. Send a contract, quote or agreement for signature from an Opportunity, Account or Contact, using your Salsox templates with record fields merged in. Recipients sign on any phone or computer, by email, WhatsApp or SMS link, with no account or app.
>
> Signature status updates on the record as it happens, the signed PDF is saved to Salesforce Files, and a completed signature can update the Opportunity stage or start a Flow. With Sign & Pay, collect a deposit or first payment as the customer signs.

**Highlights (three):**

1. Send from any record, with fields merged into your templates.
2. Live signature status and signed PDFs saved to Files.
3. Signature events that drive Flows and Opportunity stages.

**Categories:** Sales > Contract Management; Productivity > Document Generation

**Editions:** to be confirmed by the package's requirements (normally Enterprise, Unlimited and Developer for API access).

**Pricing on the listing:** Free; uses the customer's Salsox plan. A free listing keeps the security review fee waived.

## For the security review (prepare in advance)

- A description of every external endpoint the package calls, all over TLS.
- Results of a scan of the Salsox API (for example, an OWASP ZAP or Burp report) with findings fixed or explained.
- The managed package's code scanner report, with no open critical issues.
- Test credentials for reviewers, for both the Salesforce org and a Salsox account.

## Screenshots to capture once built

1. The Salsox component on an Opportunity page.
2. Choosing a template, with record fields merged.
3. Signature status on the record.
4. The signed PDF in Salesforce Files.
5. A Flow triggered by "Document completed".
