// Class fragments shared by the device bar's parts (TASK-2074).

/**
 * Visible keyboard focus: a 2px ring-coloured outline, 2px off the control
 * (DeviceBar mockup). No `outline-none` base — in Tailwind v4 it sets the
 * outline style to `none`, which the focus outline would then inherit.
 */
export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring";

/**
 * A pill on the card surface: idle devices, «ще N», «Усі категорії». 44px —
 * the storefront's touch-target floor — rather than the mockup's 40: tier 1
 * is still 56px (6px above and below) and tier 2 52px (4px), as drawn.
 */
export const BAR_PILL =
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-card text-sm font-semibold whitespace-nowrap text-foreground transition-colors";

/** Marks the control that takes focus after the active device changes. */
export const PRIMARY_CONTROL_ATTR = "data-device-bar-primary";
