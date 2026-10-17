/**
 * Brand theme colors, resolved from NEXT_PUBLIC_BRAND_* env with neutral
 * fallbacks. The kit ships neutral; set these on your deployment to apply
 * your brand from config, with no code edits (see docs/configuration.md).
 * Consumed by the CSS token override (src/app/layout.tsx) and the Open Graph
 * images. Colors should be hex (e.g. "#2563eb").
 */
import { isKitSite } from "@/config/kit"

const primary = process.env.NEXT_PUBLIC_BRAND_PRIMARY?.trim() || null
const primary2 = process.env.NEXT_PUBLIC_BRAND_PRIMARY_2?.trim() || null
const gradient = process.env.NEXT_PUBLIC_BRAND_GRADIENT?.trim() || null
/**
 * A second brand colour beside the primary: Salsox's deep violet, used by the
 * homepage for its feature band, highlighted cards and small accents
 * (`bg-brand-accent`, `text-brand-accent-text`). Set NEXT_PUBLIC_BRAND_ACCENT
 * to change it; the kit's own site has none, so it falls back to the primary
 * there (globals.css).
 */
const accent = process.env.NEXT_PUBLIC_BRAND_ACCENT?.trim() || (isKitSite ? null : "#4c1d95")
/**
 * The deployment's own mark: a path under public/ (or an absolute URL) to a
 * square image, e.g. "/brand/mark.png". Set, it replaces the neutral socket
 * head everywhere the mark appears: the logo in the page, the favicon, the
 * home-screen icon and the header of every email. Unset, the kit stays
 * neutral.
 */
// The product's own mark is the supplied logo (public/brand/logo-mark.png),
// served as its trimmed 256px copy (scripts/brand-web-assets.mjs). The
// variable still wins when set: a deployment pointing it at the old
// /brand/mark.png keeps that until the variable is changed or removed.
// Was: process.env.NEXT_PUBLIC_BRAND_MARK?.trim() || null
const mark = process.env.NEXT_PUBLIC_BRAND_MARK?.trim() || (isKitSite ? null : "/brand/web/logo-mark.png")

/**
 * The kit's own palette, restored token by token on its site
 * (KIT_SITE="true"). The theme that ships is neutral (true black and
 * grayscale) so a clone starts blank; the kit's site predates that and is
 * built on slate blues, where dark mode is a navy canvas rather than black.
 * Overriding only the accent would leave the two half-mixed, so the whole set
 * comes back together. A clone is untouched, and any NEXT_PUBLIC_BRAND_*
 * override still wins on top of this.
 */
const KIT_GRADIENT = "linear-gradient(135deg, #1d4ed8 0%, #2563eb 45%, #38bdf8 100%)"
const KIT_CSS = [
  ":root{",
  "--background:#ffffff;--foreground:#0f172a;",
  "--muted:#f8fafc;--muted-foreground:#64748b;",
  "--border:#e2e8f0;--input:#e2e8f0;--ring:#3b82f6;",
  "--primary:#1d4ed8;--primary-foreground:#ffffff;",
  "--secondary:#f1f5f9;--secondary-foreground:#0f172a;",
  "--card:#ffffff;--card-foreground:#0f172a;",
  "--popover:#ffffff;--popover-foreground:#0f172a;",
  "--accent:#f1f5f9;--accent-foreground:#0f172a;",
  `--primary-2:#38bdf8;--gradient-brand:${KIT_GRADIENT}`,
  "}",
  ".dark{",
  "--background:#0f172a;--foreground:#f8fafc;",
  "--muted:#1e293b;--muted-foreground:#94a3b8;",
  "--border:#1e293b;--input:#1e293b;--ring:#3b82f6;",
  "--primary:#2563eb;--primary-foreground:#ffffff;",
  "--secondary:#1e293b;--secondary-foreground:#f8fafc;",
  "--card:#0f172a;--card-foreground:#f8fafc;",
  "--popover:#0f172a;--popover-foreground:#f8fafc;",
  "--accent:#1e293b;--accent-foreground:#f8fafc;",
  `--primary-2:#38bdf8;--gradient-brand:${KIT_GRADIENT}`,
  "}",
  ".dark .prose{--tw-prose-links:#60a5fa}",
].join("")

export const brand = {
  /** True when a brand override is configured for this deployment. */
  isCustom: Boolean(primary || gradient || accent),
  primary,
  accent,
  primary2,
  // Solid unless a gradient is set explicitly: the visual system is flat
  // (src/app/globals.css). It used to blend primary into primary-2:
  //   (primary ? `linear-gradient(135deg, ${primary} 0%, ${primary2 ?? primary} 100%)` : null),
  gradient: gradient || (primary ? `linear-gradient(${primary}, ${primary})` : null),
  mark,
}

/**
 * Inline CSS overriding the neutral token defaults with the brand colors.
 * Applied at :root with !important so it wins in both light and dark. Returns
 * "" when no override is configured, so the kit and demo stay neutral.
 *
 * On the kit's site the full palette above is laid down first, then any env
 * override is applied on top of it.
 */
export function brandOverrideCss(): string {
  const base = isKitSite ? KIT_CSS : ""
  if (!brand.isCustom) return base
  const decls = [
    brand.primary && `--primary:${brand.primary}!important`,
    brand.primary && `--ring:${brand.primary}!important`,
    brand.primary2 && `--primary-2:${brand.primary2}!important`,
    brand.gradient && `--gradient-brand:${brand.gradient}!important`,
    brand.accent && `--brand-accent:${brand.accent}!important`,
  ].filter(Boolean)
  return decls.length ? `${base}:root{${decls.join(";")}}` : base
}

/**
 * The neutral mark: a hex socket head, the screw you turn to fasten a part.
 * It stands in for your logo until you swap it, and it lives here because two
 * files draw it and they have to draw the same shape: the logo in the page
 * (src/components/logo.tsx) and the favicon (src/app/icon.tsx).
 *
 * One path, two subpaths, `fill-rule="evenodd"`: the socket is a hole, so the
 * tile shows through it. Painted as a solid shape it would need the tile's
 * colour, which in dark mode is a translucent tint and not a colour we can
 * name. It used to be the plain lucide hexagon, which is what every dark tile
 * with a lucide icon in it looks like, down to live sites already shipping
 * that exact one. The socket costs a subpath and is nobody else's.
 *
 * The head covers 19.5 of the 24-unit box, not the 18 a lucide icon covers.
 * That is deliberate: the hexagon was drawn filled *and* stroked at 1.5, and
 * the stroke added half its width all around. Filling alone at 18 would have
 * shrunk the mark by 8% in every place that asks for it by size, the auth
 * pages and the loader included. Drawn at 19.5 they all keep the size they
 * already ask for.
 */
export const neutralMarkPath =
  "M21.75 16.333V7.667a2.167 2.167 0 0 0 -1.083 -1.874l-7.583 -4.333a2.167 2.167 0 0 0 -2.167 0l-7.583 4.333A2.167 2.167 0 0 0 2.25 7.667v8.667a2.167 2.167 0 0 0 1.083 1.874l7.583 4.333a2.167 2.167 0 0 0 2.167 0l7.583 -4.333A2.167 2.167 0 0 0 21.75 16.333z" +
  "M12 6.475l4.767 2.762v5.525L12 17.525l-4.767 -2.762v-5.525z"

/**
 * The public pages' palette, from the audit of the reference build: eight
 * colours and no others. Cream for backgrounds, mint where the hero's wash
 * starts, dark teal for headline text and the primary button, bright teal
 * for the logo, icon tiles, check marks and small accents, deep purple for
 * the features band, the footer's bottom bar and badges, black for the
 * footer and the Lifetime plan card, grey for supporting text, and white.
 *
 * Scoped to the public pages (`.brand-landing`, set by their layout), not
 * the whole app: production sets NEXT_PUBLIC_BRAND_PRIMARY (#0f766e), laid
 * down at :root with !important by brandOverrideCss, and a declaration on
 * the wrapper is the only thing that beats an inherited !important. The
 * dashboard keeps that primary until the variable is changed. Null on the
 * kit's own site, which stays on its own palette.
 */
export const landingPalette = isKitSite
  ? null
  : {
      cream: "#F8F7F3",
      mint: "#E5F3F4",
      darkTeal: "#0B3D3A",
      teal: "#11928F",
      purple: "#4C1D95",
      ink: "#0F0F19",
      gray: "#6B7280",
      white: "#FFFFFF",
    }

/**
 * The palette as tokens on `.brand-landing`. Derived tokens (--primary-hover,
 * --brand-accent-text) are declared again here because a var() resolves
 * where it is declared: inherited from :root they would still be computed
 * from the env primary. The light set applies only outside dark mode (the
 * theme script puts `dark` on <html>), so dark mode keeps the dark theme's
 * own surfaces and takes only the brand colours, bright teal standing in
 * for the dark teal, which would not read on a dark background.
 */
export function landingPaletteCss(): string {
  const p = landingPalette
  if (!p) return ""
  // Borders and the hover fill are tints of the palette, not new colours.
  const line = `color-mix(in srgb, ${p.darkTeal} 14%, ${p.white})`
  return [
    // Brand colours, both themes.
    ".brand-landing{",
    `--brand-teal:${p.teal};--brand-ink:${p.ink};--brand-accent:${p.purple};`,
    `--ring:${p.teal};--primary-2:${p.teal};`,
    "}",
    // The light surfaces and text.
    ":root:not(.dark) .brand-landing{",
    `--background:${p.cream};--foreground:${p.darkTeal};`,
    `--card:${p.white};--card-foreground:${p.darkTeal};`,
    `--popover:${p.white};--popover-foreground:${p.darkTeal};`,
    // Supporting text is the grey shaded 15% toward the dark teal: the grey
    // alone is 4.50:1 on the cream, on the AA line, and under it on the
    // tinted surfaces (axe failed the compliance strip and the plan toggle).
    // Was: --muted-foreground:${p.gray}
    `--muted:color-mix(in srgb, ${p.mint} 45%, ${p.cream});--muted-foreground:color-mix(in srgb, ${p.gray} 85%, ${p.darkTeal});`,
    `--accent:${p.mint};--accent-foreground:${p.darkTeal};`,
    `--secondary:${p.mint};--secondary-foreground:${p.darkTeal};`,
    `--border:${line};--input:${line};`,
    `--primary:${p.darkTeal};--primary-foreground:${p.white};`,
    `--primary-hover:color-mix(in srgb, ${p.darkTeal} 82%, #000000);`,
    `--gradient-brand:linear-gradient(${p.darkTeal}, ${p.darkTeal});`,
    `--brand-accent-text:${p.purple};--brand-mint:${p.mint};--brand-cream:${p.cream};`,
    "}",
    // Dark mode: the theme's surfaces stay, the brand colours brighten.
    ".dark .brand-landing{",
    `--primary:${p.teal};--primary-foreground:${p.white};`,
    `--primary-hover:color-mix(in srgb, ${p.teal} 85%, #ffffff);`,
    `--brand-accent-text:color-mix(in srgb, ${p.purple} 35%, #ffffff);`,
    `--gradient-brand:linear-gradient(${p.teal}, ${p.teal});`,
    `--brand-mint:color-mix(in srgb, ${p.teal} 18%, var(--background));--brand-cream:var(--background);`,
    "}",
  ].join("")
}

/** Solid brand accent for HTML emails (no CSS vars available there). */
export const emailAccent = brand.primary ?? (isKitSite ? "#2563eb" : "#0a0a0a")

/** Open Graph accent bar + glow, kept visible on the dark OG card. */
export const ogBrand = {
  bar: brand.gradient ?? (isKitSite ? KIT_GRADIENT : "linear-gradient(90deg, #737373, #d4d4d4)"),
  glow: brand.primary
    ? `${brand.primary}40`
    : isKitSite
      ? "rgba(37,99,235,0.25)"
      : "rgba(163,163,163,0.18)",
}
