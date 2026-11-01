// Class fragments shared by the device bar's parts (TASK-2074).

/** The house focus outline — one definition in `shared/config/focus.ts`. */
export { FOCUS_RING } from "@/shared/config";

/**
 * A pill on the card surface: idle devices, «ще N», «Усі категорії». 44px —
 * the storefront's touch-target floor — rather than the mockup's 40: tier 1
 * is still 56px (6px above and below) and tier 2 52px (4px), as drawn.
 */
export const BAR_PILL =
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-card text-sm font-semibold whitespace-nowrap text-foreground transition-interactive active:scale-98 motion-reduce:active:scale-100";

/** Marks the control that takes focus after the active device changes. */
export const PRIMARY_CONTROL_ATTR = "data-device-bar-primary";
