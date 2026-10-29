<!--
  What the Product Hunt gallery images are, where each screenshot came from,
  and how to rebuild them. The images are generated, never hand-edited: the
  source is e2e/product-hunt-gallery.spec.ts.
-->

# Product Hunt gallery

Five 1270×760 images and a 240×240 thumbnail, built with Playwright from
screenshots of the real product:

| File | What it shows | Screenshot from |
|---|---|---|
| `1-hero.png` | The homepage hero on a phone | Live salsox.com, read only |
| `2-quick-send.png` | Quick Send, filled in | The app, run locally |
| `3-mobile-signing.png` | A signer on a phone: the start screen, then adopting a signature | The app, run locally |
| `4-sign-and-pay.png` | A signer's view of a document that collects $450.00 | The app, run locally |
| `5-pricing.png` | The pricing page's heading line and its plan cards | Live salsox.com, read only |
| `thumbnail-240.png` | The plain teal "S" mark | `public/brand/mark.png` |

The local screens use fictional people (Ama Mensah, Kofi and Yaw Boateng,
example.com addresses). No email was sent and no payment was taken: the Sign
& Pay image is the signer's screen before paying. The homepage is cropped
above its illustrated dashboard, whose figures are artwork, not real numbers.

## Rebuilding

With the app running locally (`npm run dev -- --port 3100`, against a
throwaway database with the plans seeded):

```
PH_GALLERY=1 npx playwright test e2e/product-hunt-gallery.spec.ts --project=chromium
```

`PH_SITE_URL` points the live captures at another deployment (the default is
https://salsox.com).
