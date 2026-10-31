// Interaction-state class fragments (TASK-2079, ComponentStates.dc.html).
//
// Hover is pointer-only for free: Tailwind v4 compiles `hover:` / `group-hover:`
// / `peer-hover:` to `@media (hover: hover)`. On touch the only feedback is
// `active:`, so every tappable control carries one. Every transform is reset
// under `prefers-reduced-motion` (`motion-reduce:`) — colour changes stay.
// Combine with `transition-interactive` (globals.css) and `FOCUS_RING`
// (./focus) at the call site: `cn(PILL, FOCUS_RING, …)`.
// docs/design-system.md §6 is the table these implement.

/** Pills, buttons, chips: press = scale .98 (the only feedback on touch). */
export const PRESS = "active:scale-98 motion-reduce:active:scale-100";

/** 44×44 icon buttons: press = scale .94. */
export const PRESS_ICON = "active:scale-94 motion-reduce:active:scale-100";

/**
 * A 44×44 round icon button on the card surface (rail arrows, row actions):
 * hover `bg-muted`, press .94, disabled = tokens + transparent border («44 × 44
 * завжди»). Add `FOCUS_RING` at the call site.
 */
const ICON_BUTTON_BODY =
  "size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-interactive hover:bg-muted active:scale-94 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:border-transparent disabled:bg-disabled disabled:text-disabled-foreground disabled:active:scale-100";
export const ICON_BUTTON = `inline-flex ${ICON_BUTTON_BODY}`;

/**
 * Rail scroll arrows (product rails): the icon button, hidden below `sm`
 * (touch rows scroll by swipe), greyed out at the row's ends (useScrollEdges).
 */
export const RAIL_ARROW = `hidden sm:inline-flex ${ICON_BUTTON_BODY} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring`;

/** Model / category tiles: rise 2px + shadow-lift; press back to rest, scale .99, shadow-card. */
export const LIFT_TILE =
  "shadow-card hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0 active:scale-99 active:shadow-card motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100";

/** Product card: rise 4px, border foreground/25, shadow-lift; press -1px + shadow-card. */
export const LIFT_CARD =
  "hover:-translate-y-1 hover:border-foreground/25 hover:shadow-lift active:-translate-y-px active:shadow-card motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0";

/**
 * Graphite fill hover / press (Button default, selected pills, primary CTAs).
 * `bg-primary/90` was ΔL≈1 % on graphite — invisible; `primary-hover` mixes
 * 14 % towards the page and the control lifts onto the card shadow.
 */
export const PRIMARY_STATES =
  "hover:bg-primary-hover hover:shadow-card active:bg-primary active:shadow-none";

/** Text link: no underline at rest, underline 4px off on hover, pressed underline + 75 %. */
export const LINK =
  "rounded-sm font-semibold text-foreground underline-offset-4 transition-interactive hover:underline active:underline active:opacity-75";

/**
 * Pill / tab (filters, picker family tabs, series chips). Selected via
 * `data-[state=active]` (Radix tab) or `aria-pressed` (toggle pill) — add
 * `PILL_SELECTED` under that condition. A zero-count pill is `disabled` but
 * stays rendered.
 */
export const PILL =
  "inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-interactive hover:bg-muted active:scale-98 motion-reduce:active:scale-100 disabled:border-transparent disabled:bg-disabled disabled:text-disabled-foreground";
export const PILL_SELECTED =
  "border-primary bg-primary text-primary-foreground hover:bg-primary-hover";

/** Menu row (mega-menu / catalog-menu / mobile category list). Current = aria-current. */
export const MENU_ROW =
  "group/row flex min-h-11 items-center gap-3 rounded-menu py-1 pr-2.5 pl-1 text-sm font-medium text-foreground transition-interactive hover:bg-muted/60 aria-[current=page]:bg-muted";

/** The 34px icon box of a menu row; on the current row it becomes a white pad. */
export const MENU_ROW_ICON =
  "grid size-8.5 shrink-0 place-items-center rounded-menu bg-muted transition-interactive group-aria-[current=page]/row:bg-card group-aria-[current=page]/row:shadow-card";
