---
title: "Webhooks and the API: reference"
description: "The events we send, the JSON payload, how to check the signature, retries, and the API integrations use to subscribe, send documents and find them."
category: developers
order: 1
---

A webhook sends a signed JSON message to a URL you choose each time something happens to one of your documents. Integrations such as Zapier, Make and HubSpot use them to start workflows: add a signed contract to your CRM, post in a team channel, or file the PDF.

## Set up an endpoint

1. Open **Dashboard → Developers**.
2. Under **Webhooks**, enter your endpoint's URL. It must start with **https://**.
3. Choose the events to receive, then select **Add endpoint**.
4. Copy the **signing secret** that appears. It is shown once; store it with your receiving code.
5. Pick an event and select **Send test**. The result, and every later delivery, shows under **Latest deliveries**.

## Events

| Event | Sent when |
|---|---|
| `document.sent` | A document goes out for signing. |
| `document.viewed` | A recipient opens it for the first time. |
| `document.signed` | A recipient finishes signing. |
| `document.completed` | Everyone has signed and the sealed PDF is ready. |
| `payment.sent` | A signer pays through Sign & Pay. |
| `document.declined` | A recipient declines to sign. |
| `document.expired` | The signing links lapse before everyone has signed. |

Each happens once per occurrence: a second view of the same link is not sent again.

## Payload

Every delivery is a `POST` with a JSON body:

```json
{
  "id": "evt_6f1c2a9e8b7d4c3a2b1e0f9d",
  "event": "document.signed",
  "created_at": "2026-10-25T14:05:00.000Z",
  "test": false,
  "data": {
    "document": {
      "id": "cmh2x9k0w0001",
      "title": "Service agreement",
      "status": "PENDING",
      "created_at": "2026-10-25T12:35:00.000Z",
      "sent_at": "2026-10-25T13:05:00.000Z",
      "completed_at": null,
      "page_count": 3,
      "signing_order": "PARALLEL",
      "url": "https://your-app.example.com/dashboard/documents/cmh2x9k0w0001"
    },
    "recipient": {
      "id": "cmh2x9k0w0002",
      "name": "Ama Mensah",
      "email": "ama@example.com",
      "role": "SIGNER",
      "order": 0,
      "status": "SIGNED",
      "viewed_at": "2026-10-25T13:45:00.000Z",
      "signed_at": "2026-10-25T14:00:00.000Z",
      "decline_reason": null
    },
    "recipients": ["…every recipient, in signing order, same shape…"],
    "payment": null
  }
}
```

- `recipient` is the person the event is about. It is `null` for `document.sent`, `document.completed` and `document.expired`.
- Each recipient carries `decline_reason`: what they wrote when declining, or `null`.
- `payment` is set for `payment.sent`: `id`, `amount` (an integer in the currency's smallest unit, so 25000 is 250.00), `currency`, `status`, `provider` and `paid_at`.
- `test` is `true` for a delivery sent with **Send test**, which carries sample data.
- Signing links, phone numbers and IP addresses are never included.

## Headers

| Header | Contains |
|---|---|
| `Webhook-Id` | The event `id`. A retry keeps the same one, so you can ignore repeats. |
| `Webhook-Event` | The event name. |
| `Webhook-Timestamp` | When it was sent, in Unix seconds. |
| `Webhook-Signature` | `t=<timestamp>,v1=<signature>` |

## Check the signature

The signature is an HMAC-SHA256, in hex, of the timestamp, a full stop and the raw request body, keyed with the endpoint's signing secret. Check it before you trust a delivery:

1. Read the raw body exactly as received, before parsing it.
2. Split `Webhook-Signature` into `t` and `v1`.
3. Compute HMAC-SHA256 of `t` + `.` + body with your secret and compare it with `v1` in constant time.
4. Refuse the delivery if `t` is more than five minutes from your clock.

```js
import { createHmac, timingSafeEqual } from "node:crypto"

function verify(secret, header, body) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")))
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest()
  const given = Buffer.from(v1, "hex")
  return given.length === expected.length && timingSafeEqual(given, expected)
}
```

## Retries

Answer with any `2xx` status to confirm a delivery. Anything else, no answer within 10 seconds, or a redirect counts as a failure, and the same event is sent again after about 1 minute, 5 minutes, 30 minutes, 2 hours, 12 hours and 24 hours. After that it is marked **Failed**, and **Resend** sends it again by hand. Redirects are not followed, so give the final URL.

## The API, for integrations

Integrations subscribe to events, send documents and find them with an **API key**, created under **Dashboard → Developers → API keys**. Send it as `Authorization: Bearer <key>` to the base URL shown on that page, ending in `/api/v1`. A key can send documents from your account, so treat it like a password.

| Request | Does |
|---|---|
| `GET /api/v1/me` | Returns the account the key belongs to: checks a key works. |
| `GET /api/v1/webhooks` | Lists the account's endpoints. Secrets are never returned. |
| `POST /api/v1/webhooks` | Subscribes: `{ "url": "https://…", "events": ["document.completed"] }` (or `target_url` and `event`). Returns `id`, `url`, `events` and the `secret`, once. |
| `DELETE /api/v1/webhooks/{id}` | Unsubscribes. |
| `GET /api/v1/webhooks/sample?event=document.completed` | A sample payload for an event, as a one-item list. |
| `GET /api/v1/events?event=document.completed&limit=3` | Your latest real events of that kind, newest first, each exactly as a webhook carries it (up to 25). An empty list when none has happened yet. |
| `POST /api/v1/documents` | Creates a document and sends it for signing. |
| `GET /api/v1/documents` | Finds documents, newest first. |
| `GET /api/v1/documents/{id}` | One document. |
| `GET /api/v1/templates` | The templates you can send from, with their roles and blanks, and your saved ones. |

Errors come back as `{ "error": { "code": "…", "message": "…" } }` with a 4xx status. A key can make 120 requests a minute.

## Send a document

`POST /api/v1/documents` sends a document exactly as **Send** in the dashboard does: the same emails go out, it counts towards your plan the same way, and your webhooks receive `document.sent`. Give **one** source:

| Source | How |
|---|---|
| A PDF at a link | `"file_url": "https://…"`. It must be a public https address. |
| A PDF in the request | `multipart/form-data` with the PDF as a `file` part and the JSON below as a `data` part. |
| A PDF as text | `"file_base64": "…"`, for PDFs under about 3 MB. |
| A template | `"template": "<slug>"` with `"values": { "<blank>": "…" }`. `GET /api/v1/templates` lists the slugs and blanks. |
| A saved template | `"saved_template_id": "…"`. Any `values` you give replace the saved ones. |

PDFs can be up to 4 MB. A minimal request, to one signer:

```json
{
  "title": "Service agreement",
  "file_url": "https://files.example.com/service-agreement.pdf",
  "recipients": [{ "email": "ama@example.com", "name": "Ama Mensah" }]
}
```

Each signer gets a signature and a date at the foot of the last page (on a page added at the end when there are more than three signers), as with Quick Send. To place fields yourself, add `fields`:

```json
{
  "title": "Service agreement",
  "file_url": "https://files.example.com/service-agreement.pdf",
  "signing_order": "sequential",
  "recipients": [
    { "email": "ama@example.com", "name": "Ama Mensah" },
    { "email": "kofi@example.com", "name": "Kofi Boateng", "role": "approver" },
    { "email": "office@example.com", "role": "cc" }
  ],
  "fields": [
    { "recipient": 0, "type": "signature", "page": 3, "x": 8, "y": 80, "width": 40, "height": 6 },
    { "recipient": 0, "type": "date", "page": 3, "x": 56, "y": 80, "width": 24, "height": 6 }
  ]
}
```

| Field | Meaning |
|---|---|
| `recipients[]` | `email` (required), `name`, `role` (`signer`, `approver`, `viewer` or `cc`; default `signer`), `order` (default: the order listed), and `template_role` for a template. |
| `fields[]` | `recipient` (their position in `recipients`, from 0, or their email), `type` (`signature`, `initials`, `name`, `email`, `date`, `text`, `checkbox`), `page` (from 1), and `x`, `y`, `width`, `height` as percentages of the page, from its top left. `required` (default `true`) and `label` are optional. |
| `signing_order` | `parallel` (default) or `sequential`. |
| `expires_in_days` | 1 to 365, or `"never"`. Default 30. |
| `message` | A note in the invitation email. |

Fields are needed whenever the request uses anything Quick Send does not: approvers, viewers, copies, or a signing order. Without them, the request is refused with `fields_required`.

**With a template**, its fields are already placed, so leave out `fields`. Your account takes the template's own role (the one marked `sender` in `GET /api/v1/templates`). Each other role needs one recipient: name it with `template_role`, or list the recipients in the order of the roles.

The answer is `201` with the document, in the same shape as below, plus `undelivered` and `not_emailed`: how many invitation emails were refused, or not sent because email is not set up. The document is sent either way, and its links can be resent from its page.

When the document cannot be sent, nothing is kept and the error says why: `402` for a plan limit (for example a signing order on a plan without it), `403` when your email address is not confirmed yet or the daily sending limit is reached, `422` for anything in the request.

## Find documents

`GET /api/v1/documents` lists your documents, newest first, 25 at a time. Filter with:

| Parameter | Example |
|---|---|
| `status` | `completed`, or several: `sent,declined`. Also `draft`, `pending` (same as `sent`), `cancelled`, `expired`. |
| `recipient` | `ama@example.com`: documents sent to that address. |
| `title` | `agreement`: titles containing it. |
| `created_after`, `created_before` | `2026-10-01` or `2026-10-01T09:00:00Z`. |
| `limit` | 1 to 100. |
| `cursor` | The `next_cursor` from the previous page. |

```json
{
  "data": [
    {
      "id": "cmh2x9k0w0001",
      "title": "Service agreement",
      "status": "COMPLETED",
      "created_at": "2026-10-25T12:35:00.000Z",
      "sent_at": "2026-10-25T13:05:00.000Z",
      "completed_at": "2026-10-25T15:10:00.000Z",
      "page_count": 3,
      "signing_order": "PARALLEL",
      "url": "https://your-app.example.com/dashboard/documents/cmh2x9k0w0001",
      "recipients": ["…each recipient, same shape as in a webhook…"]
    }
  ],
  "next_cursor": null
}
```

A document has the same fields as `data.document` in a webhook, with its `recipients`, so a workflow can map what it finds and what it receives the same way.

## Good to know

- Webhook URLs on private or local networks are refused, for your security and ours.
- Turning an endpoint off keeps it and its history; deleting it removes both.
- **New secret** replaces the signing secret at once, so update your receiver straight after.
- To connect without writing code, see [Send document events to Zapier or Make](/resources/help/connect-zapier-or-make).
