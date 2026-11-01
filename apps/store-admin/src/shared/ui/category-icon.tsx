// Category icon from the shared sprite (TASK-1956, style B «Дуотон»).
//
// The admin copy of the storefront's `shared/ui/category-icon.tsx` (FSD and the
// app boundary forbid importing across apps). `public/icons/categories.svg` is
// a byte copy of the storefront sprite behind a «mirrors» comment — change both.
// A `<use>` that points at a missing id renders NOTHING, silently, so anything
// outside the allow-list (null, empty, a retired key) falls back to the folder.
//
// Always decorative: a text label sits next to it everywhere.

import { CategoryIcon as CATEGORY_ICON } from "@/shared/api/generated/models";
import { cn } from "@/shared/lib/utils";

export const CATEGORY_ICON_SPRITE = "/icons/categories.svg";

const KNOWN_KEYS: ReadonlySet<string> = new Set<string>([
  ...Object.values(CATEGORY_ICON),
  "all",
  "folder",
]);

/** The sprite symbol a value renders — unknown or empty → `folder`. */
export function categoryIconSymbol(icon: string | null | undefined): string {
  return icon && KNOWN_KEYS.has(icon) ? icon : "folder";
}

export interface CategoryIconProps {
  /** `Category.icon` from the API — any string is safe. */
  icon: string | null | undefined;
  className?: string;
}

export function CategoryIcon({ icon, className }: CategoryIconProps) {
  const symbol = categoryIconSymbol(icon);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      data-category-icon={symbol}
      className={cn("size-5 shrink-0", className)}
    >
      <use href={`${CATEGORY_ICON_SPRITE}#cat-${symbol}`} />
    </svg>
  );
}
