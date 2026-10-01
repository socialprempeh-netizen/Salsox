# Salsox

**E-signatures without the usual headaches.** Send any PDF for signature in under a minute, collect payment in the same flow, and let people sign on their phone. Live at [salsox.com](https://salsox.com).

- **Unlimited sending**: no envelope caps on any plan. Fair-use limits apply to prevent spam.
- **Fix, don't rebuild**: correct a wrong email or renew expired links in one click; fields and signatures are kept, and the old link stops working.
- **Mobile-first signing**: one field at a time, thumb-sized controls, no app or account for signers.
- **Sign & Pay**: signers pay by card or mobile money through Stripe or Paystack, straight to the sender.
- **Quick Send**: upload, type emails, send. Share links over WhatsApp or SMS too.
- **Honest billing**: one-click cancel, a reminder before every renewal, export everything any time.

## Stack

Next.js (App Router), Tailwind CSS v4, shadcn/ui, Prisma on PostgreSQL, Better Auth, Stripe and Paystack, Resend for email, Vercel Blob for files. Animation with framer-motion and gsap. Deployed on Vercel.

## Local development

You need Node 24 or newer and Docker (or any PostgreSQL database).

```bash
npm install
docker run -d --name salsox-db -e POSTGRES_USER=salsox -e POSTGRES_PASSWORD=salsox -e POSTGRES_DB=salsox -p 55440:5432 postgres:16-alpine
cp .env.example .env.local   # set DATABASE_URL=postgresql://salsox:salsox@localhost:55440/salsox and AUTH_SECRET
npx prisma migrate deploy && npm run db:seed
npm run dev
```

After the first run, `docker start salsox-db` brings the database back. Without email or file storage configured, development still works: signing links are logged and files go to `.data/storage`.

## Configuration

Every variable is listed with a comment in [.env.example](.env.example) and explained in [docs/configuration.md](./docs/configuration.md). Production refuses to start without:

| Variable | Why |
|---|---|
| `DATABASE_URL`, `AUTH_SECRET` | The database and signed sessions |
| `NEXT_PUBLIC_APP_URL` | `https://salsox.com`, the canonical URL behind every link, email and sitemap entry |
| `BLOB_READ_WRITE_TOKEN` | Storage for uploaded and sealed PDFs |
| `RESEND_API_KEY`, `EMAIL_FROM` | Signing invitations, reminders and receipts |
| `CRON_SECRET` | The daily jobs: link expiry, reminders, re-sealing, renewal notices, IndexNow |

Sign & Pay needs `STRIPE_*` and/or `PAYSTACK_*`; see [docs/esign.md](./docs/esign.md).

## Tests

```bash
npx tsc --noEmit && npm run lint && npm test   # types, lint, unit tests
npm run test:e2e                               # Playwright: signing flow, checkout, mobile layout
```

The e2e suite needs the local database and a Chromium (`npx playwright install chromium`). `e2e/responsive.spec.ts` checks every main page for horizontal scroll at 360px and 390px.

## Where things live

| Path | What |
|---|---|
| `src/lib/esign/` | The signing engine: rules, state, PDF handling, payments, emails. Pages and actions call into it |
| `src/app/` | Routes: the public site under `[locale]`, the dashboard, sign-in, `/sign/[token]`, API routes |
| `src/locales/en.json` | Every user-facing string |
| `content/` | The public docs, blog posts and `changelog.md` |
| `docs/` | Developer guides for this codebase |

Working rules for contributors (and coding agents) are in [AGENTS.md](./AGENTS.md) and [CLAUDE.md](./CLAUDE.md).

## Releases

The version lives in `package.json`, `src/config/site.ts` (`version`) and the newest entry of [content/changelog.md](./content/changelog.md), which `/changelog` renders. Tests fail if they disagree. After a bump, run `npm install --package-lock-only` so the lockfile follows.

## Credits

Salsox started from [OpenStarterKit](https://github.com/openstarterkit/nextjs-saas-starter-kit) 2.3.3 (MIT); its licence notice is kept in [LICENSE](./LICENSE). The `upstream` git remote points there. Pull from it, but never push to it.
