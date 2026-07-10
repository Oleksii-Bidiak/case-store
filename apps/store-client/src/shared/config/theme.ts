// Theme constants
//
// These mirror the semantic design tokens defined in `app/globals.css`
// (e.g. `--color-primary`). Tailwind classes (`bg-primary`, `text-primary`)
// should be used in markup; this file exists only for the rare APIs that
// require a concrete color value and cannot consume a CSS variable or class
// — e.g. Next.js `viewport.themeColor`.

/** Primary brand color (light) — mirrors `--color-primary` in globals.css. */
export const PRIMARY_COLOR = "#4f46e5";

/**
 * Primary brand color (dark) — mirrors the dark-mode `--color-primary` in
 * globals.css. Used for the theme-reactive `viewport.themeColor` pair so the
 * browser chrome matches the brand indigo under both OS themes.
 */
export const PRIMARY_COLOR_DARK = "#6366f1";
