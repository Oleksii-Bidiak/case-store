// Test-only fixtures for the «Каталог» menu (TASK-2072): a four-level tree in
// the shape of the mockup's `catalog-tree.js` (the dev seed has two levels,
// so levels 3–4 only exist here), and a matchMedia stub.

import type { CategoryTreeNodeEntity } from "@/entities/category";

let sortOrder = 0;

export function node(
  id: string,
  name: string,
  children: CategoryTreeNodeEntity[] = [],
  over: Partial<CategoryTreeNodeEntity> = {},
): CategoryTreeNodeEntity {
  return {
    id,
    name,
    slug: id,
    description: null,
    image: null,
    isActive: true,
    sortOrder: sortOrder++,
    metaTitle: null,
    metaDescription: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    children,
    ...over,
  };
}

/**
 * «Чохли › Чохли для iPhone › З MagSafe › Силіконові з MagSafe» (five
 * level-3 children → «Ще 1 →»), «Кабелі та перехідники › Кабелі USB-C ›
 * USB-C — USB-C › 240 Вт», and a childless root.
 */
export const CATALOG_TREE: CategoryTreeNodeEntity[] = [
  node(
    "cases",
    "Чохли",
    [
      node("iphone-cases", "Чохли для iPhone", [
        node("magsafe", "З MagSafe", [
          node("magsafe-silicone", "Силіконові з MagSafe"),
        ]),
        node("silicone", "Силіконові"),
        node("leather", "Шкіряні"),
        node("clear", "Прозорі"),
        node("folio", "Книжки"),
      ]),
      node("samsung-cases", "Чохли для Samsung"),
    ],
    { icon: "cases" },
  ),
  node(
    "cables",
    "Кабелі та перехідники",
    [
      node("usb-c", "Кабелі USB-C", [
        node("usb-c-usb-c", "USB-C — USB-C", [node("240w", "240 Вт")]),
      ]),
    ],
    { icon: "cables" },
  ),
  node("memory", "Карти пам’яті та флешки", [], { icon: null }),
];

/**
 * jsdom cannot navigate; without a router `next/link` falls back to the
 * native click, which logs «Not implemented: navigation» per link. Swallow
 * link clicks after React has handled them. Returns the cleanup.
 */
export function blockNavigation(): () => void {
  const block = (event: MouseEvent) => {
    if ((event.target as Element | null)?.closest?.("a[href]")) {
      event.preventDefault();
    }
  };
  window.addEventListener("click", block);
  return () => window.removeEventListener("click", block);
}

/** Stub `window.matchMedia`: the listed queries match, every other does not. */
export function setViewport(matches: Record<string, boolean>): void {
  window.matchMedia = (query: string) =>
    ({
      matches: Boolean(matches[query]),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
