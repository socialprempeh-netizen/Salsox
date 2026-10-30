<!--
  Three Zap templates for the Salsox Zapier app, ready to build in Zapier's
  Zap template creator. Part of integrations/zapier (LISTING.md is the
  listing). Zapier accepts templates only for a public integration (Beta
  counts), so these wait until the app is approved. Written on
  30 October 2026 to Zapier's template rules: sentence-case titles that start
  with a verb, plural items, "new" for new items, no "sync" or "automatic";
  descriptions of two to four sentences that start from the person's goal,
  never say "Zap", "trigger" or "action", and have no links. Steps use no
  Formatter, Code, Paths, Looping or Webhooks (not allowed in templates).
-->

# Zap templates: Salsox

In the template creator, use only the mappings below and leave every other
field empty, so nothing account-specific (a channel, a folder, a template)
is fixed in the template.

## 1. Save signed PDFs to Google Drive

**Title:** Upload signed PDFs of new completed Salsox documents to Google Drive

**Description:**

> Keep a copy of every signed agreement in your shared drive without downloading it by hand. When everyone has signed a document in Salsox, this automation uploads the signed PDF, with its signing certificate, to the Google Drive folder you choose. Your team finds every signed contract in one place, named after the document.
> *Note: Salsox adds the signing certificate to the signed PDF itself, so the file in Google Drive is the complete record.*

**Steps:**

1. **Salsox**, New Completed Document.
2. **Google Drive**, Upload File.
   - File: `Signed PDF`
   - File Name: the Salsox field `Document title`
   - Drive and Folder: left empty for the person to choose.

## 2. Send a document for signature from a form response

**Title:** Send Salsox documents for signature from new Google Forms responses

**Description:**

> Turn a form submission into a document ready to sign, without copying anything across. When someone submits your Google Form, this automation fills one of your Salsox templates with their answers and sends it to them for signature on any phone. It works for onboarding forms, booking requests, and service orders.
> *Note: choose your template in the Salsox step; its signer and fill-in fields then appear for you to map from the form.*

**Steps:**

1. **Google Forms**, New Form Response.
2. **Salsox**, Send Document From Template.
   - Template: left empty (each person picks their own).
   - Everything else empty: a fixed message would not suit every account.

The signer email and the blanks appear only once a template is chosen, so
they cannot be mapped in the template itself. The note in the description
tells people to map them.

## 3. Hear about declined documents in Slack

**Title:** Send Slack channel messages for new declined Salsox documents

**Description:**

> Find out the moment a client turns down a contract, so you can follow up while the deal is still warm. When a recipient declines to sign a document in Salsox, this automation posts a message to your Slack channel with the document, who declined, and the reason they gave. Your team can then fix the problem and resend it the same day.

**Steps:**

1. **Salsox**, New Declined Document.
2. **Slack**, Send Channel Message.
   - Channel: left empty.
   - Message Text:
     `{{Recipient name}} ({{Recipient email}}) declined "{{Document title}}": {{Decline reason}}. Open it: {{Document link}}`
     (each `{{…}}` is the Salsox field of that label, inserted from the field picker).

## Before submitting each one

1. In the template dashboard, open the `...` menu, choose **Create Zap**, and
   run it once with a real Salsox account (Zapier's own check before review).
2. Submit for review. Zapier usually answers within two weeks.
3. Once approved, add the templates to the Help Center article on Zapier
   (see LISTING.md), where Zapier recommends showing them.
