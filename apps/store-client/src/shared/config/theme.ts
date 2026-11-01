// Theme constants
//
// These mirror the semantic design tokens defined in `app/globals.css`.
// Tailwind classes (`bg-background`, `text-primary`) should be used in markup;
// this file exists only for the rare APIs that require a concrete color value
// and cannot consume a CSS variable or class — e.g. Next.js
// `viewport.themeColor` and the web manifest.

/**
 * Browser-chrome colour per theme — mirrors `--color-background` in
 * globals.css (light / dark). Since TASK-1951 the chrome takes the page
 * background, not the primary: direction В makes primary a graphite pill that
 * inverts to near-white in dark, which would paint a white bar over a dark page.
 *
 * Used as the static `viewport.themeColor` media pair (layout.tsx), as the
 * manifest's `theme_color`, and keyed by the next-themes value so a manual
 * light/dark pick can outrank the OS-driven pair on the client (TASK-506,
 * `features/theme` ThemeColorSync).
 */
export const THEME_COLOR = {
  light: "#f6f5f9",
  dark: "#111118",
} as const;
