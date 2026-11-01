// Class fragments shared by the picker's parts (TASK-2070).

import type { DeviceFamily } from "@/entities/device";

/** The house focus outline — one definition in `shared/config/focus.ts`. */
export { FOCUS_RING } from "@/shared/config";

/** Small uppercase section label («Додати ще один», series names). */
export const KICKER =
  "text-xs font-semibold tracking-wider text-muted-foreground uppercase";

/** Device type drawn on a family's icon disc (phones by default). */
export type DeviceGlyph = "phone" | "watch" | "tablet";

export function deviceGlyph(family: DeviceFamily | null): DeviceGlyph {
  if (family === "watch") return "watch";
  if (family === "ipad") return "tablet";
  return "phone";
}

/** `sm` — the dialog layout starts here; below it the panel is a sheet. */
export const DIALOG_MEDIA_QUERY = "(min-width: 40rem)";

/**
 * True when the picker renders as the centred dialog (≥ 640). Below that it
 * is a bottom sheet on a touch screen, where a programmatic `focus()` on the
 * search field would pop the on-screen keyboard over the sheet.
 */
export function isDialogLayout(): boolean {
  return window.matchMedia?.(DIALOG_MEDIA_QUERY).matches ?? false;
}
