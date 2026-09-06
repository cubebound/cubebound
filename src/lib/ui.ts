/**
 * Shared class strings for the app's chrome.
 *
 * Before this, the same button lived as a 130-character Tailwind string copied
 * into 36 files — 74 occurrences — so every polish change was 74 edits and the
 * variants had already drifted apart. These are the one definition.
 *
 * **Strings, not components, and a plain `.ts` with no `"use client"`.** Both
 * server and client components import them, and a client module's exports
 * cannot be called from the server (see CLAUDE.md, Conventions) — shared
 * *values* belong in `src/lib/` whichever direction they travel. Strings also
 * keep call sites free to add a layout class (`w-full`, `ml-auto`, `shrink-0`)
 * without a prop for each one.
 *
 * Colours come from the tokens in `globals.css`, which redefine themselves
 * under `.dark`. That is why almost nothing here carries a `dark:` variant.
 *
 * Focus is **not** handled here: `globals.css` sets one `:focus-visible` rule
 * globally, so it reaches controls these strings never touch.
 */

/* ── Buttons ──────────────────────────────────────────────────────────────
   Two sizes, because the codebase genuinely uses two: `md` (h-10) for page
   actions and forms, `sm` (h-9) for the controls packed into a cube header or
   the card filter bar. */

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium " +
  "whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-60";

const md = "h-10 px-4 text-sm";
const sm = "h-9 px-3 text-sm";

/** High-contrast neutral fill. The accent deliberately stays off it — orange
 *  marks state here, not every call to action, so a page with three buttons
 *  does not read as three warnings. */
const primary = "bg-ink text-surface hover:bg-ink-hover";
/** Outlined. Transparent ground so it sits correctly on `surface` and on a
 *  `raised` panel alike. */
const secondary = "border border-line text-ink hover:bg-hover";
/** No border until hovered — for controls that should recede, like a toolbar. */
const ghost = "text-muted hover:bg-hover hover:text-ink";
const danger =
  "bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600";

export const btn = {
  primary: `${btnBase} ${md} ${primary}`,
  primarySm: `${btnBase} ${sm} ${primary}`,
  secondary: `${btnBase} ${md} ${secondary}`,
  secondarySm: `${btnBase} ${sm} ${secondary}`,
  ghost: `${btnBase} ${md} ${ghost}`,
  ghostSm: `${btnBase} ${sm} ${ghost}`,
  danger: `${btnBase} ${md} ${danger}`,
  dangerSm: `${btnBase} ${sm} ${danger}`,
} as const;

/** Previous / Next and the like: shorter than a button, same vocabulary. */
export const pager =
  "inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 " +
  "text-sm transition-colors hover:bg-hover";

/* ── Fields ───────────────────────────────────────────────────────────────
   `bg-sunken` rather than `bg-raised`: an input should read as a well you type
   into. No `focus:outline-none` anywhere — that is what removed the focus
   indicator from eight fields before. */

const fieldBase =
  "w-full rounded-md border border-line bg-sunken text-ink " +
  "placeholder:text-subtle transition-colors hover:border-line-strong";

export const input = `${fieldBase} h-10 px-3 text-sm`;
export const inputSm = `${fieldBase} h-9 px-3 text-sm`;
export const textarea = `${fieldBase} px-3 py-2 text-sm`;

export const label = "block text-sm font-medium text-ink";
/** Radio and checkbox tint, so the brand reaches the forms too. */
export const check = "accent-accent-strong";

/* ── Surfaces ─────────────────────────────────────────────────────────────
   One step of elevation is most of what made the old pages read as flat: every
   panel sat at exactly the page's own colour with a hairline around it. */

export const panel = "rounded-lg border border-line bg-raised";
/** A list whose rows divide rather than repeat the border. */
export const panelList = "divide-y divide-line rounded-lg border border-line bg-raised";
/** Empty states — dashed, so "nothing here" is legible as a state not a bug. */
export const panelEmpty =
  "rounded-lg border border-dashed border-line-strong bg-raised/40 p-10 text-center text-muted";

/** Warnings, moderation notices and the backup-sign-in prompt.
 *  Amber rather than the brand orange on purpose: the accent means "this is
 *  where you are", and a warning must not borrow that. */
export const notice =
  "rounded-md border border-amber-500/50 bg-amber-50/70 p-4 text-sm " +
  "dark:border-amber-500/35 dark:bg-amber-950/25";

/* ── Text ─────────────────────────────────────────────────────────────── */

export const link =
  "text-accent underline underline-offset-2 transition-colors hover:text-accent-hover";
/** A link that only underlines on hover — for names in lists and bylines. */
export const linkQuiet = "underline-offset-2 transition-colors hover:underline";
export const navLink =
  "text-sm text-muted transition-colors hover:text-ink";
export const errorText = "text-sm text-red-600 dark:text-red-400";
export const help = "text-xs text-subtle";

/* ── Tabs ─────────────────────────────────────────────────────────────────
   Two shapes, both already in use: pills over a cube's views and a search's
   ordering, an underline across a page's top-level sections. The active state
   is where the accent earns its keep — it is the one thing on screen that says
   "you are here", which is exactly what a brand colour should mark. */

export const tab = {
  active:
    "rounded-md bg-accent/12 px-3 py-1.5 text-sm font-medium text-accent " +
    "ring-1 ring-accent/30 transition-colors",
  inactive:
    "rounded-md border border-line px-3 py-1.5 text-sm font-medium text-muted " +
    "transition-colors hover:bg-hover hover:text-ink",
} as const;

export const segment = {
  active: "px-3 py-1.5 text-sm font-medium bg-accent/12 text-accent transition-colors",
  inactive: "px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-hover hover:text-ink",
} as const;

export const cardTab = {
  active:
    "flex-1 rounded-md px-3 py-2 text-left text-sm transition-colors " +
    "bg-accent/12 text-accent ring-1 ring-accent/30",
  inactive:
    "flex-1 rounded-md border border-line px-3 py-2 text-left text-sm " +
    "transition-colors hover:bg-hover",
} as const;

export const underlineTab = {
  active: "-mb-px border-b-2 border-accent-strong px-1 pb-2 text-sm font-medium text-ink",
  inactive:
    "-mb-px border-b-2 border-transparent px-1 pb-2 text-sm font-medium text-muted " +
    "transition-colors hover:border-line-strong hover:text-ink",
} as const;

/* ── Badges ───────────────────────────────────────────────────────────── */

const badgeBase = "shrink-0 rounded px-2 py-0.5 text-xs font-medium";

export const badge = {
  neutral: `${badgeBase} bg-sunken text-muted ring-1 ring-line`,
  good: `${badgeBase} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200`,
  warn: `${badgeBase} bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200`,
} as const;

/** Cube visibility, mapped once so a badge cannot come to mean two things.
 *  Public is the notable state; unlisted is the one with a caveat. */
export const visibilityBadge: Record<string, string> = {
  public: badge.good,
  unlisted: badge.warn,
  private: badge.neutral,
};

/* ── Menus ────────────────────────────────────────────────────────────── */

export const menu =
  "z-50 rounded-lg border border-line bg-raised p-1 shadow-lg shadow-black/5 dark:shadow-black/40";
export const menuItem =
  "block w-full rounded px-3 py-2 text-left text-sm transition-colors hover:bg-hover";
