<!--
  The Salsox app's Zapier listing and publishing-form answers, ready to paste
  into the Zapier Developer Platform (developer.zapier.com). Part of
  integrations/zapier (README.md is the app itself, ZAP-TEMPLATES.md the
  templates). Checked on 30 October 2026 against Zapier's Integration
  Publishing Requirements and Build Guidelines, and against the code in this
  folder. Nothing here has been submitted.
-->

# Zapier listing: Salsox

## Integration settings (Platform UI, Settings)

**Name:** Salsox

Zapier's rule 6.1: the exact brand name, nothing added ("app",
"integration", a domain, ™).

**Description (140 characters at most):**

> Salsox is an e-signature app for sending PDFs and templates to sign on any phone, with no account needed to sign. (113)

Alternative:

> Salsox is an e-signature app: send a PDF or a template for signature, track every view and signature, and keep the signed copy. (127)

Zapier's rule 6.2: it starts "Salsox is a…", has no links, does not name
Zapier or any other app, and says what Salsox does instead of selling it.
My pick: the first, because it names the two things the actions send.

**Homepage URL:** https://salsox.com (the marketing site, not the dashboard;
rule 6.3).

**Logo:** `assets/logo-256.png`, the plain teal "S" mark at 256×256 PNG, the
same icon as the browser extension and the WordPress plugin. It has no
words in it, as Zapier asks. Zapier also asks for a transparent background;
this mark is a full square tile, so there is no background to make
transparent.

**Category:** Signatures. If that is not in the list, use Documents.

**Intended audience:** Public.

**Role:** "I'm an employee/founder of the company that owns this app" (or
however the form words ownership).

## Publishing form (Integration Home, Publish)

Each answer below is what to paste, or what to choose.

**API documentation:**
https://salsox.com/resources/help/webhooks-and-api (every endpoint the app
uses: `/me`, `/webhooks`, `/webhooks/{id}`, `/webhooks/sample`, `/events`,
`/templates`, `/documents`, `/documents/{id}/pdf`).

**How do people get an API key?** In Salsox, Dashboard, Developers, Create
key. Any plan can create one, the free plan included, with no need to
contact support.

**Test account (rule 7.1):** integration-testing@zapier.com, on the Business
plan with no trial or document limit. Salsox signs in by email link
(passwordless) as well as by password, so Zapier's team can reach the
account either way.

**Privacy policy:** https://salsox.com/privacy
**Terms of service:** https://salsox.com/terms
**Support:** https://salsox.com/contact

**Notes for the reviewer** (paste as is):

> Salsox is an e-signature app. This integration uses Salsox's public REST API with an API key the user creates in Salsox (Dashboard, Developers). All six triggers are REST hooks: each Zap gets its own subscription, and perform list returns the account's latest real events (up to 100, newest first) in exactly the delivery's shape, falling back to a sample for a new account. "New Completed Document" also carries the signed PDF as a hydrated file. "Send Document From Template" loads the chosen template's signer roles and blanks as dynamic fields. "Send Document From PDF" takes a file or a public PDF link and places a signature and a date for each signer. Salsox also supports collecting payments while signing, but that is deliberately left out of this integration. The test account is on the Business plan, so every step works without limits.

## Step copy (already in the code; here for review)

| Step | Label | Description |
| --- | --- | --- |
| Trigger | New Signature | Triggers when a recipient signs a document. |
| Trigger | New Completed Document | Triggers when every recipient has signed a document. |
| Trigger | New Declined Document | Triggers when a recipient declines to sign a document, with their reason. |
| Trigger | New Document View | Triggers when a recipient opens a document for the first time. |
| Trigger | New Sent Document | Triggers when a document is sent for signature. |
| Trigger | New Expired Document | Triggers when a document's signing links expire before everyone has signed. |
| Action | Send Document From Template | Sends a document for signature from one of your templates, with its blanks filled in. |
| Action | Send Document From PDF | Sends a PDF for signature, with a signature and a date placed for each signer. |
| Search | Find Document | Finds the most recent document matching a title, a recipient's email or a status. |

## Help Center text, for after Zapier approves the app

Today `content/help/articles/connect-zapier-or-make.md` tells people to use
"Webhooks by Zapier". Once the app is listed (Beta counts), replace its
"Connect Zapier" section with this, and keep the Make section as it is:

> ## Connect Zapier
>
> 1. In Salsox, open **Dashboard → Developers** and select **Create key**. Name it "Zapier" and copy it.
> 2. In Zapier, create a Zap and search for **Salsox**.
> 3. Choose a trigger, such as **New Completed Document**, or an action, such as **Send Document From Template**.
> 4. When Zapier asks you to connect Salsox, paste the key.
> 5. Test the step. Zapier shows your latest real documents, or a sample if you have not sent one yet.
>
> **New Completed Document** includes the signed PDF as a file, so the next step can save it to Google Drive or attach it to an email.

Until then, the current article stays as it is. It must not tell people to
search for an app they cannot find yet.
