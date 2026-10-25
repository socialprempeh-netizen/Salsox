---
title: "Developers: webhooks and API keys"
summary: "Add a webhook endpoint, send a test, read a delivery, and create an API key for an integration."
minutes: 3
---

## Before you record

- Sign in as **Ama Mensah** (**ama.mensah@example.com**) on the **Business** plan.
- Have a request bin open in another tab with an https URL ready to paste, for example a Zapier **Catch Hook** URL.
- No endpoints or API keys on the account yet.

## Script

### Scene 1: Introduction

**On screen:** the dashboard, sidebar visible.

**Say:** Webhooks send your document events to other software the moment they happen: sent, viewed, signed, completed, and paid.

**Do:** Select **Developers** in the sidebar.

### Scene 2: Add an endpoint

**On screen:** the Developers page, Webhooks section.

**Say:** Paste the URL that should receive events, and choose which events it wants.

**Do:** Paste the URL, leave all five events ticked, and select **Add endpoint**.

**Say:** This is the signing secret. It is shown once: copy it to wherever your receiving code lives.

### Scene 3: Send a test

**On screen:** the new endpoint's card.

**Do:** Choose **document.completed** and select **Send test**.

**Say:** The test arrives with sample data and a signature header. Here it is in the request bin, and here it is under Latest deliveries.

### Scene 4: API keys

**On screen:** the API keys section.

**Say:** Integrations like Zapier subscribe through the API with a key. Name it after the integration, so you know which key to revoke later.

**Do:** Type **Zapier** and select **Create key**, then copy the key.

**Say:** That is all an integration needs. The full reference is in the Help Center article on webhooks and the API.
