@AGENTS.md

# Salsox standing rules

<!--
  The standing rules for this project, read at the start of every session.
  The line above imports AGENTS.md (the nine repository rules and the Next.js
  notice that `next dev` maintains); keep it first. The rules below are
  Salsox's own and sit on top of those: where the two overlap, follow both.
-->

## Stack

Next.js (App Router), Tailwind CSS v4, shadcn/ui, Prisma, Better Auth, Stripe
and Paystack. Animation libraries: framer-motion and gsap, both installed.

## Design rules

- **Load the `frontend-design` skill before building or editing any UI.** If
  the skill is not available in the session, say so before starting instead of
  silently going without it.
- **Square corners, site-wide.** No rounded edges on boxes, inputs or cards.
  New UI uses no `rounded-*` classes on those elements, and UI being edited is
  squared as part of the edit.
- **Mobile-first.** Build for the phone width first, then widen. Verify
  responsiveness on every UI change, at 360px and 390px at minimum
  (`e2e/responsive.spec.ts` checks the main pages for horizontal scroll at
  those widths; add new pages to it).
- **Polished on the first pass.** Modern SaaS-quality UI from the start, not a
  basic version to refine later.
- **Animate every new UI component** with framer-motion or gsap: framer-motion
  for component-level transitions (enter, exit, layout, hover), gsap for
  timelines and scroll-driven sequences. Both run in client components only,
  and both must respect `prefers-reduced-motion`.
- **Rebuild, do not copy.** When a Magic UI or 21st.dev style component is the
  reference, recreate the pattern with what is installed here (shadcn/ui,
  framer-motion, gsap). Never paste external component code.

## Engineering rules

- **Comment every new file.** At least a header saying what the file is for
  and why it exists, in the style of the files around it.
- **Reversing a decision does not delete the old code.** Comment it out, with a
  line saying what replaced it and why, so the earlier approach stays readable.
- **Commit and push once verified, without asking first.** Verified means
  `npx tsc --noEmit`, `npm run lint` and `npm test` pass, plus the mobile check
  above for any UI change. Push the current branch to the project's own
  remote; never to `upstream`, which is the public starter kit this was built
  from.
- **The signing engine lives in `src/lib/esign`.** Rules, state, PDF handling,
  payments and emails for signing stay there; pages, actions and components
  call into it and do not re-implement its logic.

## Anything unspecified

Use judgment, pick the option that fits the rules above, and say which choice
was made.

## Security: temporary production credential files
Whenever you create a local file to hold a production secret pulled from
Neon or elsewhere (e.g. .env.production.local) for a one-off command like
a migration, DELETE the file immediately after the command finishes
(Remove-Item). Never leave it sitting on disk. This applies to Claude Code
and to manual terminal steps alike.
