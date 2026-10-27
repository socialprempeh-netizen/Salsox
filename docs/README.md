# OpenStarterKit Documentation

Everything you need to go from `git clone` to production.

| Guide | Read it when |
|---|---|
| [Getting started](./getting-started.md) | First run: clone, environment, database, dev server |
| [Configuration](./configuration.md) | Setting up env vars, OAuth apps, Stripe, email and branding |
| [Authentication](./authentication.md) | Understanding the sign-in methods, password reset and account linking |
| [Billing & payments](./billing.md) | Subscriptions, one-time payments, usage-based billing and entitlements |
| [Blog & content](./blog.md) | File-based MDX blog with categories, RSS and per-post SEO |
| [Newsletter & waitlist](./newsletter.md) | Double opt-in mailing list, consent record, Resend sync and admin export |
| [Languages](./i18n.md) | Adding a language, translating the docs, and keeping translations current |
| [Deployment](./deployment.md) | Shipping to Vercel, production env, webhooks, going admin |
| [Upgrading](./upgrading.md) | Taking a newer version without losing your work, and the cost in advance |
| [E-signatures (Salsox)](./esign.md) | How documents are sent, signed, paid for and sealed, and how to configure it |
| [Webhooks and the API](./webhooks.md) | Sending document events to other software, API keys for integrations, and how deliveries stay safe |
| [Integrations](./integrations.md) | HubSpot and Salesforce connections, the Salesforce write-back, and Salsox's OAuth server |
| [AppSumo lifetime deals](./appsumo.md) | Selling a lifetime plan through AppSumo's licensing API: webhooks, tiers, redemption and refunds |
| [The signing Chrome extension](./signing-extension.md) | How the extension connects to an account and sends through the API, and the extension ids the server must allow |
| [SEO](./seo.md) | Landing, tool and comparison pages, the rules against duplicates, Search Console, IndexNow and analytics |

Quick pointers:

- The fastest possible start is in [Getting started](./getting-started.md): you can run the kit locally with just a database, no OAuth apps needed (there is a dev-only login).
- Every environment variable is listed with comments in [.env.example](../.env.example) and explained in [Configuration](./configuration.md).
- Found a security issue in the kit? Report it privately through [our security policy](https://github.com/openstarterkit/nextjs-saas-starter-kit/security/policy), please do not open a public issue.
- What already shipped in Salsox is in [content/changelog.md](../content/changelog.md), rendered at `/changelog`. The starter kit's own history is in its [CHANGELOG](https://github.com/openstarterkit/nextjs-saas-starter-kit/blob/main/CHANGELOG.md) upstream.
