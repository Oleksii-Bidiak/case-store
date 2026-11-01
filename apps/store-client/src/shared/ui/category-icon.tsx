// Category icon from the shared sprite (TASK-1956, style B «Дуотон»).
//
// One external SVG sprite — `public/icons/categories.svg` — holds a symbol per
// allowed key (`cat-<key>`) plus `cat-all` and `cat-folder`. A `<use>` that
// points at a missing id renders NOTHING, silently, so every key outside the
// allow-list (null, empty, a key the sprite no longer has) falls back to the
// generic folder. The admin panel carries a byte copy of the sprite.
//
// Always decorative: the category name is rendered next to it, so the icon is
// hidden from assistive tech. Categories stay neutral (Д3 colour rule) — the
// glyph paints in `currentColor`, the caller picks the text colour.

import { CategoryIcon as CATEGORY_ICON } from "@/shared/api/generated/models";
import { cn } from "@/shared/lib/utils";

/** The sprite URL — same-origin, one cached request for every icon. */
export const CATEGORY_ICON_SPRITE = "/icons/categories.svg";

/** Keys an admin can assign — mirrors the API's `CategoryIcon` enum. */
export const CATEGORY_ICON_KEYS = Object.values(CATEGORY_ICON);

export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

/** Sprite-only symbols: the «all categories» entry and the fallback. */
type SpriteOnlyKey = "all" | "folder";

const KNOWN_KEYS: ReadonlySet<string> = new Set<string>([
  ...CATEGORY_ICON_KEYS,
  "all",
  "folder",
]);

export function isCategoryIconKey(
  value: string | null | undefined,
): value is CategoryIconKey {
  return (
    typeof value === "string" &&
    (CATEGORY_ICON_KEYS as readonly string[]).includes(value)
  );
}

/** The sprite symbol a value renders — unknown or empty → `folder`. */
export function categoryIconSymbol(
  icon: string | null | undefined,
): CategoryIconKey | SpriteOnlyKey {
  return icon && KNOWN_KEYS.has(icon)
    ? (icon as CategoryIconKey | SpriteOnlyKey)
    : "folder";
}

/** Sizes from the mockup; 16 px is the legibility floor — nothing smaller. */
const SIZE_CLASS = {
  16: "size-4",
  20: "size-5",
  22: "size-5.5",
  24: "size-6",
} as const;

export type CategoryIconSize = keyof typeof SIZE_CLASS;

export interface CategoryIconProps {
  /** `Category.icon` from the API — any string is safe. */
  icon: string | null | undefined;
  /** Rendered size in px (default 20). A `size-*` in `className` wins. */
  size?: CategoryIconSize;
  className?: string;
}

export function CategoryIcon({
  icon,
  size = 20,
  className,
}: CategoryIconProps) {
  const symbol = categoryIconSymbol(icon);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      data-category-icon={symbol}
      className={cn("shrink-0", SIZE_CLASS[size], className)}
    >
      <use href={`${CATEGORY_ICON_SPRITE}#cat-${symbol}`} />
    </svg>
  );
}
