# Hunter crawler (Fly.io)

The outreach agent's Hunter reads competitors' review pages on G2, Capterra
and Trustpilot. Those pages build their lists in JavaScript, so they are
rendered here, by Crawl4AI in headless Chromium, and handed back as Markdown.
The app calls it from `src/lib/outreach-agent/crawl4ai.ts`; robots.txt is
checked in the app before any URL is sent, and again by Crawl4AI.

It is its own small service because Vercel functions cannot run a browser
of this size, and it stays out of `src/` because it is Python, built and
deployed separately.

## What it serves

- `POST /crawl`: `{ urls, browser_config, crawler_config }`, answered with
  `{ results: [{ url, success, status_code, error_message, markdown }] }`,
  the same shape as Crawl4AI's own server. Needs
  `Authorization: Bearer <CRAWLER_API_TOKEN>`; without the secret set, every
  request is refused.
- `GET /health`: for Fly's health check.

## Deploy

From this directory, with [flyctl](https://fly.io/docs/flyctl/) logged in:

```sh
fly deploy
```

First time only, the app and its secret:

```sh
fly apps create salsox-crawler
fly secrets set CRAWLER_API_TOKEN=<a long random value>
```

Then in the Vercel project (Production), the two variables the app reads:

- `CRAWL4AI_URL` = `https://salsox-crawler.fly.dev`
- `CRAWL4AI_API_TOKEN` = the same value as `CRAWLER_API_TOKEN`

The machine is always on (`fly.toml`): the Hunter runs from a cron, and a
machine waking up on the first request is how a scheduled run fails quietly.

## What the review sites allow (checked 2026-10-29)

- G2 and Capterra permit the review pages in robots.txt, but both turn a
  headless browser away at their bot protection: G2 with a DataDome captcha
  (HTTP 403), Capterra with a Cloudflare JS challenge. The page comes back as
  failed, with that reason, and the Hunter's run log says so.
- Trustpilot's robots.txt disallows the filtered review URLs the Hunter
  uses, so they are skipped before anything is fetched.

Getting past a captcha or a challenge is not something this service does:
it reads what a site lets it read. Until a site offers an API or allows the
crawler, Reddit (through its official API) is the source that produces
leads.
