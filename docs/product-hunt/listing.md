<!--
  Product Hunt launch kit for Salsox: the listing itself, field by field,
  ready to paste into Product Hunt's launch form. Part of docs/product-hunt/
  (listing.md, maker-comment.md, launch-day.md, gallery/), written for the
  launch on Tuesday 3 November 2026.

  Every claim here was checked against the code or the live site on
  29 October 2026 (see "Facts this kit relies on" at the end). Nothing was
  submitted: this file is for Richard to copy from.
-->

# Product Hunt listing: Salsox

**Launch:** Tuesday 3 November 2026, 12:01 AM Pacific (PST).
That is **8:01 AM in Accra**, not 7:01: US daylight saving ends on Sunday
1 November, so Pacific time is UTC−8 that week. 7:01 AM Accra would be
11:01 PM Pacific on Monday, a day early.

**Maker:** @awuchee (solo maker, no hunter needed: you can launch it yourself).

## Name

Salsox

## Tagline (max 60 characters)

Pick one:

1. **Send, sign and get paid, from any phone** (39). The site's own headline;
   says all three things in one line.
2. **E-signatures your clients sign on their phone** (45). Leads with the
   signer's side, the part most tools neglect.
3. **Get a PDF signed and paid for in one link** (41). Leads with Sign & Pay,
   the thing no other free e-signature tool does in one step.

My pick: **1**. It matches the homepage, so people who click through see the
same promise.

## Description (max 260 characters)

Pick one:

1. Salsox is e-signature built for phones. Upload a PDF, add who signs, and send by email, WhatsApp or SMS. Signers need no account. On the Business plan, Sign & Pay collects a payment as they sign. Free for 3 documents a month. (225)

2. Send any PDF for signature in one screen with Quick Send. Your client signs on their phone with no account, and can pay you in the same step (Sign & Pay). Typo in an email? Fix it without rebuilding the document. 3 free documents a month. (238)

My pick: **2**. It names three concrete things a visitor can try in the first
minute.

## Topics

Choose three in Product Hunt's topic picker (check each one exists there
when you fill in the form; the list changes):

1. Productivity
2. Legal
3. Payments

Alternatives if one is missing: SaaS, Small Business, Freelance.

## Pricing

- **Pricing type:** Free options (a free plan plus paid plans).
- **Line for the listing or the first comment:**
  "Free for 3 documents a month, no card needed. Personal is $9 a month for
  unlimited documents. Business is $19 a month with Sign & Pay, with a
  14-day free trial."

**Promo code: none exists today, so do not offer one.** If you want a
Product Hunt offer, it takes two steps you have to do yourself, and both must
be done before launch:

1. In Stripe, create a coupon and a promotion code (for example
   `PRODUCTHUNT`, with the discount and expiry you choose).
2. In Vercel, set `STRIPE_ALLOW_PROMOTION_CODES=true` on Production and
   redeploy, so checkout shows the code field. (It is off today.)

Then add one line to the maker comment: "Product Hunt visitors: code
PRODUCTHUNT gives you … until …". Paystack checkouts do not take Stripe
codes, so say it applies to card payments.

## Links

| Field | Link |
|---|---|
| Website | https://salsox.com |
| Pricing (in the comment) | https://salsox.com/pricing |
| Sign & Pay (in the comment) | https://salsox.com/sign-and-pay |
| Sign up | https://salsox.com/signup |
| X | https://x.com/richardprempe |
| LinkedIn | https://www.linkedin.com/company/145335943/ |

Product Hunt adds its own tracking to the website link; do not add UTM
parameters to it.

## Media

- **Thumbnail (240×240):** `gallery/thumbnail-240.png`, the plain teal "S"
  mark from `public/brand/mark.png`.
- **Gallery (1270×760), in this order:**
  1. `gallery/1-hero.png`: send, sign and get paid, from any phone
  2. `gallery/2-quick-send.png`: Quick Send
  3. `gallery/3-mobile-signing.png`: signing on a phone, no account
  4. `gallery/4-sign-and-pay.png`: Sign & Pay
  5. `gallery/5-pricing.png`: free to start, 3 documents a month
- **Video:** optional; none is made. Skip it rather than add a slideshow.

## Facts this kit relies on

Checked on 29 October 2026. If any of these changes before launch, change the
copy with it.

| Claim | Where it is true |
|---|---|
| 3 free documents a month | `FREE_DOCUMENTS_PER_MONTH = 3` in `src/lib/esign/plans.ts`; the pricing page says "Start free with 3 documents a month" |
| Signers need no account or app | The signing page (`/sign/[token]`) runs in the browser with no sign-in |
| Quick Send | `/dashboard/documents/quick-send`: upload a PDF, enter who signs, send; a signature and date field is placed for each signer. No plan gate |
| Send by email, WhatsApp or SMS | The invitation goes by email; each recipient has a Share menu with WhatsApp and SMS links (`src/lib/esign/share.ts`). No plan gate |
| Fix a wrong email without rebuilding | Edit on the recipient (`src/lib/esign/recipients.ts`): the old link stops working, the new address gets a fresh one, signed fields are kept. No plan gate |
| Sign & Pay | Business plan only (plan gate `plan_signAndPay`); card through Stripe, card and mobile money through Paystack |
| Prices | Live pricing page: Personal $9 a month, Business $19 a month with a 14-day free trial, Lifetime $299 one time |

Left out on purpose because they could not be verified as true for every
visitor today: SMS reminders (they need an SMS provider configured), user
counts, customer names, reviews, ratings and awards (there are none to cite).
