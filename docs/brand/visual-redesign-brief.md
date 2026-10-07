# Salsox Visual Redesign Brief

## Reference
Use the live PandaDoc website (https://www.pandadoc.com/) as the visual
design reference for Salsox. Do NOT guess - inspect the actual PandaDoc
UI (browser/DevTools) and use its real design values wherever possible.

Visual language to bring over from PandaDoc:
- Cream/off-white backgrounds
- Black/dark typography
- Green accent colors, green buttons and their styling
- Button sizes, padding, radius, typography
- Font choices, weights, sizes, hierarchy
- Section heading styles
- Navigation styling
- Cards, borders, radius
- Shadows
- Spacing and whitespace
- Page section backgrounds
- Forms and inputs
- Badges
- Icons
- Hover/active states
- Transitions
- Empty states
- Loading/skeleton states
- Dashboard styling
- Document/signing interface
- Overall visual polish and consistency

Use PandaDoc's actual inspected values where possible. Fall back to the
typography spec below only where PandaDoc's real values can't be
inspected.

## Fallback typography (only if PandaDoc values are not inspectable)
- Inter for body/UI
- Poppins or similar modern grotesk for display/hero headings
- Headings: 600-700 weight
- Body: 14-16px
- Navigation: 13-14px
- Buttons: 14px / 600
- Hero: 52-64px desktop
- Section headings: 32-40px
- Card radius: 10-14px
- Button/input radius: 8-10px
- Transitions: 150-250ms
- Lucide icons used consistently

## Logo
Salsox logo: public/brand/logo.png - green rounded-square mark with a
white "S" flowing into a checkmark "V". Use this as the brand mark
across the site (nav, favicon, app icon, email headers).

## CRITICAL constraint
Do NOT change Salsox's existing page arrangement, positioning,
navigation structure, content structure, component placement, or
overall layout. Do NOT turn Salsox into a PandaDoc copy.

Think of it as: Salsox layout + PandaDoc visual language + Salsox
branding (green, not PandaDoc's exact brand green - adapt their
*system*, not their identity).

Apply this globally through shared design tokens/components so the
whole app is consistent. Preserve all existing functionality.
