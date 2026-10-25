# Salesforce AppExchange: listing draft

**Status: draft, not submittable yet.** AppExchange lists solutions from Salesforce partners that pass a security review. Salsox needs, first: enrolment in the Salesforce partner program; the integration itself, most simply a managed package with a Lightning component and a connected app (OAuth) that calls the Salsox public API; and a passed security review of both the package and the Salsox endpoints it calls.

Requirements and fees: [ISVforce security review fees](https://developer.salesforce.com/docs/atlas.en-us.244.0.packagingGuide.meta/packagingGuide/security_review_fees.htm) and the [review cycle](https://developer.salesforce.com/docs/atlas.en-us.244.0.packagingGuide.meta/packagingGuide/security_review_complete_the_review_cycle.htm). Per those pages, the review fee is waived for free solutions and charged for paid or freemium ones; results take about three to four weeks. Confirm current fees in the Partner Console before you plan: they have changed between guide versions.

This is the largest of the three builds. Do it after Zapier and HubSpot.

**Update 2026-10-25:** the Salsox endpoints a package would call have started to exist: signed webhooks for document events and an API-key REST API at `/api/v1` (documented at `/resources/help/webhooks-and-api`). The package still needs OAuth for its connected app, an API to send documents from a Salesforce record, and the security review, which will scan these endpoints: the webhook sender already refuses private addresses and does not follow redirects, which reviewers check for.

**Second update 2026-10-25:** the API to send documents from a record exists now (`POST /api/v1/documents`, from a PDF or a template, with recipients and fields), as do finding documents (`GET /api/v1/documents`, `GET /api/v1/documents/{id}`) and listing templates (`GET /api/v1/templates`). `file_url` downloads apply the same private-address and redirect checks as webhooks. What remains is OAuth, scoped in the next section and not built, then the package and the review.

## OAuth: what this listing requires (scoped, not built)

A separate decision, so only scoped here. Check each point against Salesforce's current documentation when the build starts. Salesforce is moving connected apps to "External Client Apps", and Named Credentials changed shape in recent releases.

There are two directions, and the package needs the first. The second is optional.

**1. The package calls Salsox: Salsox becomes an OAuth 2.0 authorization server (required).**

The package's Apex calls `/api/v1` through a **Named Credential** with an **External Credential**, the way Salesforce expects secrets to be held. The security review looks for credentials stored in custom settings, custom metadata or code and fails them. A personal Salsox API key pasted into a Named Credential custom header may pass, but it ties the org to one person's key and cannot be scoped or expired. The listing should use OAuth:

- **Grant:** authorization code with PKCE, with refresh tokens. In the org, an admin authenticates the External Credential with the "browser flow". Salesforce sends them to Salsox's authorize page, they sign in to Salsox and approve, and Salesforce exchanges the code at Salsox's token endpoint and stores and refreshes the tokens itself.
- **To build on the Salsox side:**
  - `/oauth/authorize` (consent screen: which org, which permissions).
  - `/oauth/token` (`authorization_code` and `refresh_token` grants, PKCE `S256`), token revocation, and client registration for the package (one confidential client, its redirect URL being Salesforce's callback for the Auth. Provider).
  - Scopes that map onto the API: for example `documents:send`, `documents:read`, `templates:read`, `webhooks:manage`.
  - Access tokens accepted by `withApiKey` (`src/lib/api/v1.ts`) next to API keys, with the same 120-a-minute limit and the scope checked per route.
  - A page in Settings listing connected apps, with revoke.
- **Library:** Better Auth, already the auth layer here, publishes an OAuth 2.0 / OIDC provider plugin as a separate package (not installed; confirm its current name and maturity first). Building on it keeps sessions, sign-in and 2FA in one place, and the admin sign-in policy (`src/lib/security-policy.ts`) then applies to the consent step too.

**2. Salsox writes back into Salesforce: Salsox as an OAuth client of Salesforce (optional).**

To update the record and save the signed PDF to Files *as events happen*, Salsox must call the org's REST API. That needs its own connected app (or External Client App) with the web server flow (authorization code, refresh token), per org, storing the `instance_url` and an encrypted refresh token, and using `test.salesforce.com` for sandboxes. It adds a second token store and a second part of the review.

**Recommendation:** build direction 1 only. The package keeps itself current by asking Salsox (`GET /api/v1/documents/{id}` when the record is opened, and a scheduled Apex job for open documents). Salesforce then holds every token, and Salsox calls nothing inside the org. The signed PDF still needs an endpoint the API does not have yet, `GET /api/v1/documents/{id}/pdf`, for the package to save to Files.

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
