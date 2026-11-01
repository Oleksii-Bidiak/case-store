import { FOCUS_ON_DARK_CLASS } from "@/shared/config";

// Class strings shared by the footer's server part and its client islands
// (TASK-2078, SiteFooter mockup). The footer is dark in both themes, so every
// focus indicator is the white outline (FOCUS_ON_DARK_CLASS), never `ring`.

/** Column / legal link: dim → full white + underline on pointer hover. */
export const FOOTER_LINK = `inline-flex min-h-11 items-center gap-2 self-start rounded-sm text-sm text-footer-foreground/70 underline-offset-4 transition-colors duration-150 hover:text-footer-foreground hover:underline md:min-h-9 ${FOCUS_ON_DARK_CLASS}`;

/**
 * A white pill on the ink panel. Theme-invariant on purpose: `bg-card` is
 * #1b1a24 in the dark theme — the footer's own ink — and the pill vanished.
 */
export const FOOTER_PILL = `inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-footer-foreground px-4.5 text-sm font-semibold text-footer transition-[box-shadow,transform] duration-150 hover:ring-4 hover:ring-footer-foreground/18 motion-safe:active:scale-98 ${FOCUS_ON_DARK_CLASS}`;

/** Outline pill (socials). */
export const FOOTER_OUTLINE_PILL = `inline-flex h-11 items-center rounded-full border border-footer-foreground/22 px-3.5 text-sm font-semibold transition-colors duration-150 hover:border-transparent hover:bg-footer-foreground/14 md:h-9 ${FOCUS_ON_DARK_CLASS}`;

/** The column heading text (desktop heading and mobile disclosure share it). */
export const FOOTER_HEADING = "font-display text-sm font-bold";
