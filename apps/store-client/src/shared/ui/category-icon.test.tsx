import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render } from "@testing-library/react";

import {
  CATEGORY_ICON_KEYS,
  CategoryIcon,
  categoryIconSymbol,
  isCategoryIconKey,
} from "./category-icon";

/** `<use>` href of the only svg rendered. */
function useHref(container: HTMLElement): string | null {
  return container.querySelector("svg use")?.getAttribute("href") ?? null;
}

/** `src/shared/ui` → the app root. */
const APP_ROOT = join(__dirname, "../../..");
const STOREFRONT_SPRITE = join(APP_ROOT, "public/icons/categories.svg");
const ADMIN_SPRITE = join(
  APP_ROOT,
  "../store-admin/public/icons/categories.svg",
);
const MIRROR_COMMENT =
  "<!-- mirrors apps/store-client/public/icons/categories.svg — change both -->\n";

describe("CategoryIcon (TASK-1956)", () => {
  it("points the <use> at the key's sprite symbol", () => {
    const { container } = render(<CategoryIcon icon="chargers" />);
    expect(useHref(container)).toBe("/icons/categories.svg#cat-chargers");
  });

  it.each([null, undefined, "", "rocket"])(
    "falls back to the folder for %p",
    (icon) => {
      const { container } = render(<CategoryIcon icon={icon} />);
      expect(useHref(container)).toBe("/icons/categories.svg#cat-folder");
    },
  );

  it("renders the sprite-only «all» symbol", () => {
    const { container } = render(<CategoryIcon icon="all" />);
    expect(useHref(container)).toBe("/icons/categories.svg#cat-all");
  });

  it("is decorative and never focusable", () => {
    const { container } = render(<CategoryIcon icon="cases" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
  });

  it("maps the size prop to a size class and lets className override it", () => {
    const { container, rerender } = render(
      <CategoryIcon icon="cases" size={16} />,
    );
    expect(container.querySelector("svg")).toHaveClass("size-4");

    rerender(<CategoryIcon icon="cases" size={24} className="size-8" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("size-8");
    expect(svg).not.toHaveClass("size-6");
  });

  it("guards assignable keys only", () => {
    expect(isCategoryIconKey("glass")).toBe(true);
    expect(isCategoryIconKey("folder")).toBe(false);
    expect(isCategoryIconKey("all")).toBe(false);
    expect(isCategoryIconKey(null)).toBe(false);
    expect(categoryIconSymbol("memory")).toBe("memory");
  });
});

describe("categories.svg sprite (TASK-1956)", () => {
  const sprite = readFileSync(STOREFRONT_SPRITE, "utf8");

  // A <use> pointing at a missing id renders nothing — silently.
  it.each([...CATEGORY_ICON_KEYS, "all", "folder"])(
    "has a symbol for %s",
    (key) => {
      expect(sprite).toContain(`<symbol id="cat-${key}" viewBox="0 0 24 24">`);
    },
  );

  it("paints in currentColor only", () => {
    expect(sprite).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("the admin copy is the storefront sprite behind the mirror comment", () => {
    const admin = readFileSync(ADMIN_SPRITE, "utf8");
    expect(admin).toBe(MIRROR_COMMENT + sprite);
  });
});
