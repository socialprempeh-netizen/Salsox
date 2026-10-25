---
title: "Send document events to Zapier or Make"
description: "Start a Zapier or Make workflow when a document is signed or completed, using their webhook triggers. No code needed."
category: developers
order: 2
---

Zapier and Make can both start a workflow from a webhook. Point one of your endpoints at them and every chosen event, such as a completed document, can add a row to a spreadsheet, update a CRM or post a message.

## Connect Zapier

1. In Zapier, create a Zap and choose **Webhooks by Zapier** as the trigger, with the **Catch Hook** event.
2. Copy the webhook URL Zapier shows you.
3. Open **Dashboard → Developers**, paste the URL under **Webhooks**, choose the events, and select **Add endpoint**.
4. Select **Send test** on the new endpoint, then **Test trigger** in Zapier. Zapier now knows the fields: document title, signer name and email, and the rest.
5. Add the action you want, for example a row in Google Sheets with the document title and `completed_at`, and turn the Zap on.

## Connect Make

1. In Make, create a scenario and add **Webhooks → Custom webhook** as the first module.
2. Select **Add**, name the webhook, and copy its address.
3. Add that address as an endpoint under **Dashboard → Developers**, with the events you want.
4. In Make, select **Redetermine data structure**, then **Send test** on the endpoint, so Make learns the fields.
5. Add the next modules and turn the scenario on.

## Good to know

- One endpoint per workflow keeps each Zap or scenario independent; you can have up to 10.
- Use `document.completed` to act once everything is signed, and `document.signed` to act on each signature.
- The fields Zapier and Make show are described in [Webhooks and the API: reference](/resources/help/webhooks-and-api).
- Sample deliveries are marked `"test": true`, so a workflow can skip them.
