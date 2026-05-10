/**
 * Design tokens — single source of truth for semantic Tailwind class strings.
 * Import from here instead of writing inline class strings to ensure every
 * page and component uses the existing design system consistently.
 */

// ─── Page-level containers ────────────────────────────────────────────────────

/** Top-level page wrapper for standard dashboard pages. */
export const PAGE_WRAPPER = "space-y-6"

/** Settings / narrow content pages — max-width constrained. */
export const SETTINGS_WRAPPER = "max-w-4xl mx-auto space-y-6"

// ─── Page headers ─────────────────────────────────────────────────────────────

/** Main page title for landmark / top-level pages (28–40px, bold). */
export const PAGE_TITLE = "section-title text-foreground"

/** Main title for settings and inner pages (18px, bold). */
export const SETTINGS_TITLE = "card-heading text-foreground"

/** Page subtitle / description line. */
export const PAGE_SUBTITLE = "body-text text-muted-foreground mt-1"

/** Page header row — flex with column-to-row responsive layout. */
export const PAGE_HEADER_ROW =
  "flex flex-col gap-4 md:flex-row md:items-center md:justify-between"

// ─── Card helpers ─────────────────────────────────────────────────────────────

/**
 * Token-aware glass card className for cases where you cannot change the
 * Card `variant` prop (e.g., when adding to an existing className).
 * Replaces: `bg-white/60 dark:bg-gray-900/60` and similar patterns.
 */
export const CARD_GLASS_CLASS =
  "bg-card border-border backdrop-blur-sm"

/** Standard input background — replaces `bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700`. */
export const INPUT_STANDARD = "bg-card-inner border-border"

// ─── Badge variant constants ──────────────────────────────────────────────────
// Maps semantic intent to the Badge component's `variant` prop.

export const BADGE_SUCCESS = "success" as const
export const BADGE_WARNING = "warning" as const
export const BADGE_ERROR = "error" as const
export const BADGE_DESTRUCTIVE = "destructive" as const
export const BADGE_DEFAULT = "default" as const
export const BADGE_SECONDARY = "secondary" as const
export const BADGE_OUTLINE = "outline" as const

// ─── Status semantic colors ───────────────────────────────────────────────────
// For non-Badge elements (status dots, inline highlights, etc.).
// Always prefer <Badge> when possible; use these for raw spans/divs.

export const STATUS_COLORS = {
  success: {
    text: "text-[color:var(--green-status)]",
    bg: "bg-[color:var(--green-status)]/10",
    border: "border-[color:var(--green-status)]/20",
  },
  warning: {
    text: "text-[color:var(--orange)]",
    bg: "bg-[color:var(--orange)]/10",
    border: "border-[color:var(--orange)]/20",
  },
  error: {
    text: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/20",
  },
  info: {
    text: "text-teal-400",
    bg: "bg-teal-500/10",
    border: "border-teal-500/20",
  },
  muted: {
    text: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-border",
  },
} as const

// ─── Metric / stat value colors ───────────────────────────────────────────────
// Replaces inline `text-green-600`, `text-red-600`, `text-blue-600` etc.

export const METRIC_POSITIVE = "text-[color:var(--green-status)] font-bold"
export const METRIC_NEGATIVE = "text-destructive font-bold"
export const METRIC_NEUTRAL = "text-foreground font-bold"
export const METRIC_RUNNING = "text-teal-400 font-bold"
export const METRIC_WARNING = "text-[color:var(--orange)] font-bold"

// ─── Inline alert / notification banners ─────────────────────────────────────

export const BANNER_SUCCESS =
  "rounded-xl border border-[color:var(--green-status)]/20 bg-[color:var(--green-status)]/10 px-4 py-3 text-sm text-[color:var(--green-status)]"
export const BANNER_ERROR =
  "rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
export const BANNER_INFO =
  "rounded-xl border border-teal-500/20 bg-teal-500/10 px-4 py-3 text-sm text-teal-400"
export const BANNER_WARNING =
  "rounded-xl border border-[color:var(--orange)]/20 bg-[color:var(--orange)]/10 px-4 py-3 text-sm text-[color:var(--orange)]"

// ─── Table / list helpers ─────────────────────────────────────────────────────

/** Standard table header row — replaces `bg-gray-50/50 dark:bg-gray-800/30`. */
export const TABLE_HEADER_ROW = "bg-card-inner hover:bg-card-inner"
