# Chrome Web Store listing: Salsox Signing

Draft text for the store listing, to paste in the developer dashboard. **Not submitted**: testing first (branch `salsox/signing-extension`).

**Name:** Salsox Signing

**Summary (132 characters max):**
Send a PDF for e-signature from your browser: place signature, date and text fields, add signers' emails, send with Salsox.

**Category:** Productivity

**Language:** English

**Description:**

Salsox Signing sends a PDF for signature without opening another tab.

- Sign in with your Salsox account
- Choose a PDF (up to 4 MB)
- Click to place signature, date and text fields, and drag them into place
- Up to five signers, each in their own colour
- Add each signer's email and a message, and send

Signers get an email with a link and sign on any phone or computer, no account needed. Every document is tracked, with reminders and an audit trail, on salsox.com.

Works with every Salsox plan. The Free plan sends 3 documents a month; signing in order and Sign & Pay are part of the Business plan.

**Single purpose (for review):** Prepare a PDF in the browser and send it for e-signature through the user's Salsox account.

**Permission justifications:**
- storage: keep the user's connection, plan and the document being prepared on their computer.
- identity: open the Salsox sign-in window (chrome.identity.launchWebAuthFlow) when the user connects their account.
- Host access to https://salsox.com/*: send the document and read the account's plan through Salsox's API.

**Data usage disclosures:** Handles authentication information (an API key for the user's own account) and website content the user provides (the PDF, signer names and emails), sent only to salsox.com to provide the extension's single purpose. Not sold, not used for unrelated purposes, not used for creditworthiness.

**Remote code:** No. pdf.js is bundled.

**Privacy policy URL:** host `PRIVACY.md` publicly before submitting (as the Orphan Page Scanner's is, at /resources/help/orphan-page-scanner-privacy).

**Assets still needed:** 1280x800 screenshots and the 440x280 promo tile, taken from the extension once testing is done.

**Before submitting:** after the first upload, copy the item's extension id into `SIGNING_EXTENSION_IDS` on the production server, or Connect will refuse it.
