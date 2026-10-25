---
title: "Orphan Page Scanner: privacy"
description: "What the free Orphan Page Scanner extension and skill read, store and share: only the site you scan, kept on your computer, sent nowhere."
category: developers
order: 3
---

The Orphan Page Scanner is a free Chrome extension, and a Claude skill, that lists the pages in a website's sitemap which no other page of the site links to. It collects no personal data and sends nothing to us or to anyone else.

## What it reads

Only the website you choose to scan: its `robots.txt`, its sitemap and the pages the sitemap lists. The requests go from your browser (or, for the skill, from the computer running it) straight to that website, without your cookies.

## What it stores

The extension keeps the last result for each site you scanned, the page addresses with their link counts and status, in your browser's extension storage on your computer. Removing the extension removes them. The skill stores nothing; it prints its result, and writes a CSV only where you ask it to.

## What it shares

Nothing. There is no analytics, no tracking, no account and no remote code.

## Permissions

The extension asks for access to a site only when you press **Scan site** on it, and only for that site. It also uses:

| Permission | Why |
|---|---|
| `activeTab` | To read the address of the tab you opened it on, so it knows which site to scan. |
| `storage` | To keep each site's last result on your computer. |

## Delete what it stored

1. Open `chrome://extensions` in Chrome.
2. Find **Orphan Page Scanner by Salsox** and select **Remove**.
3. Confirm. Chrome deletes the extension with every result it kept.

To keep the extension but take back access to a site, open its **Details**, then **Site access**, and remove that site.

## Questions

Write to us through the [contact page](/contact).
