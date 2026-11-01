// Class strings shared by the mega menu, its device column and the sheet's
// step-by-step catalog (TASK-2072). Static strings, so Tailwind's scanner sees
// every class.

/** The house focus outline — one definition in `shared/config/focus.ts`. */
export { FOCUS_RING } from "@/shared/config";

/** The neutral icon square in front of a level-1 row. */
export const ICON_SQUARE =
  "flex shrink-0 items-center justify-center rounded-menu bg-muted text-foreground";
