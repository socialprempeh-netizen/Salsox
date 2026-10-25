---
title: "Send document events to Zapier or Make"
description: "Start a Zapier or Make workflow when a document is signed or completed, and send documents for signature from one. No code needed."
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

## Send a document from a workflow

A Zap or a scenario can also send a document for signature, for example when a deal is won or a form is submitted. You need an API key from **Dashboard → Developers → API keys**.

**In Zapier**, add a **Webhooks by Zapier** action with the **Custom Request** event:

1. Method **POST**, URL ending in `/api/v1/documents` (the base URL is on the Developers page).
2. Under **Headers**, add `Authorization` with the value `Bearer ` followed by your key, and `Content-Type` with `application/json`.
3. In **Data**, write the request, filling in fields from earlier steps, for example a PDF link and the signer's email:

```json
{
  "title": "Service agreement",
  "file_url": "https://files.example.com/service-agreement.pdf",
  "recipients": [{ "email": "ama@example.com", "name": "Ama Mensah" }]
}
```

**In Make**, add an **HTTP → Make a request** module with the same method, URL, headers and body.

To send one of the library's templates instead of a PDF, give `"template"` and its `"values"`. Every option is in [Webhooks and the API: reference](/resources/help/webhooks-and-api#send-a-document). To look a document up later in a workflow, use `GET /api/v1/documents` with `recipient` or `status`.

## Good to know

- One endpoint per workflow keeps each Zap or scenario independent; you can have up to 10.
- Use `document.completed` to act once everything is signed, and `document.signed` to act on each signature.
- The fields Zapier and Make show are described in [Webhooks and the API: reference](/resources/help/webhooks-and-api).
- Sample deliveries are marked `"test": true`, so a workflow can skip them.
