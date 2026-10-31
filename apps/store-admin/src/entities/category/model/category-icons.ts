// Category icon keys (TASK-1956) — the allow-list an admin can assign.
//
// Mirrors the API's `CategoryIcon` enum (Orval const), so a key added on the
// backend shows up here on the next `generate:api`; `all` and `folder` are
// sprite-only symbols and are never assignable. A new icon is a `chore` in
// code: draw it in style B, add it to both sprites, the API allow-list and a
// label in `dict.categoryForm.icon.labels`.

import { CategoryIcon as CATEGORY_ICON } from "@/shared/api";
import { dict } from "@/shared/config";

export type CategoryIconKey =
  (typeof CATEGORY_ICON)[keyof typeof CATEGORY_ICON];

/** Assignable keys in the picker's order (the mockup's grid order). */
export const CATEGORY_ICON_KEYS: readonly CategoryIconKey[] =
  Object.values(CATEGORY_ICON);

export function isCategoryIconKey(
  value: string | null | undefined,
): value is CategoryIconKey {
  return (
    typeof value === "string" &&
    (CATEGORY_ICON_KEYS as readonly string[]).includes(value)
  );
}

/** The singular admin label for a key; anything else reads as the folder. */
export function categoryIconLabel(icon: string | null | undefined): string {
  return isCategoryIconKey(icon)
    ? dict.categoryForm.icon.labels[icon]
    : dict.categoryForm.icon.folder;
}
