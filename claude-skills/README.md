# Salsox tools for Claude

Free Claude skills from Salsox, packaged as a Claude Code plugin marketplace.

## Orphan Page Scanner

`orphan-page-scanner/` is a plugin with one skill: it finds the pages a website's sitemap lists that no other page of the site links to, and turns the result into specific internal-linking fixes. It runs a bundled Node script (`skills/orphan-page-scanner/scripts/find-orphans.mjs`); no install, no API key, nothing sent anywhere but the site being scanned.

The scanning rules (`scripts/scan.js`) are a copy of the Chrome extension's (`extensions/orphan-page-scanner/lib/scan.js`); a test in `src/lib/orphan-scanner.test.ts` fails if the two ever differ.

### Install in Claude Code

From a clone of this repository, or once it is published on GitHub:

```
/plugin marketplace add <path-or-github-repo>/claude-skills
/plugin install orphan-page-scanner@salsox-tools
```

### Upload to claude.ai

`node scripts/package-orphan-scanner-skill.mjs` writes `dist/orphan-page-scanner-skill.zip`, the skill folder with `SKILL.md` at its root, for **Settings > Capabilities > Skills > Upload**.

### Submitting to a marketplace

Submission is manual. What a listing needs is in `orphan-page-scanner/LISTING.md`.

## Licence

MIT, see `orphan-page-scanner/LICENSE`.
