// Class fragments shared by the «Мої пристрої» parts (TASK-2076).

/**
 * Visible keyboard focus: a 2px ring-coloured outline, 2px off the control
 * (ComponentStates). No `outline-none` base — in Tailwind v4 it sets the
 * outline style to `none`, which the focus outline would then inherit.
 */
export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring";

/** Press feedback, off under reduced motion. */
const PRESS =
  "transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-98 motion-reduce:transition-none motion-reduce:active:scale-100";

/**
 * The card's pill buttons/links (`.md-btn`). 44px rather than the mockup's
 * 40: design-system §8 asks 44×44 of every touch target.
 */
export const PILL = `inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-semibold text-foreground no-underline hover:bg-muted ${PRESS} ${FOCUS_RING}`;

/** `.md-btn.pri` — the primary fill on the same pill. */
export const PILL_PRIMARY = `inline-flex h-11 items-center gap-1.5 rounded-full border border-primary bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 hover:shadow-card ${PRESS} ${FOCUS_RING}`;

/** «Додати пристрій» — the 48px page CTA (`.md-add`). */
export const ADD_CTA = `inline-flex h-12 items-center justify-center gap-2 rounded-cta bg-primary pr-5.5 pl-4.5 text-base font-semibold text-primary-foreground hover:bg-primary/90 hover:shadow-card ${PRESS} ${FOCUS_RING}`;

/** «Підписати» / «Забути» — underlined text buttons, 44px tall hit area. */
export const TEXT_ACTION = `inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-muted-foreground underline underline-offset-3 transition-colors hover:text-foreground motion-reduce:transition-none ${FOCUS_RING}`;
