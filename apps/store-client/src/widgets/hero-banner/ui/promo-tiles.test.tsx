import { render, screen, within } from "@testing-library/react";
import type { BannerEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";
import {
  MAX_PROMO_TILES,
  PromoShowcase,
  resolvePromoTiles,
} from "./promo-tiles";

function tileBanner(
  id: string,
  title: string,
  imageUrl: string | null = null,
  theme: string | null = null,
): BannerEntity {
  return {
    id,
    placement: "PROMO_TILE",
    title,
    subtitle: null,
    imageUrl,
    imageBlurDataUrl: null,
    ctaLabel: null,
    ctaHref: "/promo",
    theme,
    sortOrder: 0,
    status: "PUBLISHED",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

const banners = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    tileBanner(`t${i + 1}`, `Плитка ${i + 1}`),
  );

const SLIDER = <div data-testid="slider">слайдер</div>;

function renderShowcase(list?: BannerEntity[]) {
  const view = render(<PromoShowcase slider={SLIDER} banners={list} />);
  const slot = (name: "beside" | "below") =>
    view.container.querySelector<HTMLElement>(`[data-promo-slot="${name}"]`);
  return { ...view, slot };
}

describe("PromoShowcase — layout of up to five tiles (TASK-2013)", () => {
  it("puts two tiles beside the slider, splitting its height, with no row below", () => {
    const { slot } = renderShowcase(banners(2));

    const beside = slot("beside")!;
    expect(within(beside).getAllByRole("link")).toHaveLength(2);
    expect(beside).toHaveClass("lg:grid-rows-2");
    expect(slot("below")).toBeNull();

    // The slider takes two of the three columns from lg.
    const top = screen.getByTestId("slider").parentElement!;
    expect(top).toHaveClass("lg:col-span-2");
    expect(top.parentElement).toHaveClass("lg:grid-cols-3");
  });

  it("sends tiles 3–5 to a three-column row under the block", () => {
    const { slot } = renderShowcase(banners(5));

    expect(
      within(slot("beside")!)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["Плитка 1", "Плитка 2"]);
    const below = slot("below")!;
    expect(
      within(below)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["Плитка 3", "Плитка 4", "Плитка 5"]);
    expect(below).toHaveClass("md:grid-cols-3");
  });

  it("splits a row of exactly two below into halves, not thirds", () => {
    const { slot } = renderShowcase(banners(4));

    expect(slot("below")).toHaveClass("md:grid-cols-2");
    expect(slot("below")).not.toHaveClass("md:grid-cols-3");
  });

  it("lets a single tile fill the side column's full height", () => {
    const { slot } = renderShowcase(banners(1));

    expect(slot("beside")).toHaveClass("lg:grid-rows-1");
    expect(slot("below")).toBeNull();
  });

  it("never draws more than five tiles, even when older rows exceed the limit", () => {
    const { container } = renderShowcase(banners(7));

    expect(container.querySelectorAll("[data-promo-tile]")).toHaveLength(
      MAX_PROMO_TILES,
    );
    expect(screen.queryByText("Плитка 6")).toBeNull();
  });

  it("renders the two fallback tiles beside the slider when no banner is published", () => {
    const { slot } = renderShowcase([]);

    expect(within(slot("beside")!).getAllByRole("link")).toHaveLength(
      dict.home.promoTiles.length,
    );
    expect(slot("below")).toBeNull();
  });
});

describe("resolvePromoTiles — tone (direction В colour rule)", () => {
  it("is a white card by default — no accent rotation by position", () => {
    const tiles = resolvePromoTiles(banners(3));

    expect(tiles.map((t) => t.tone)).toEqual(["bg-card", "bg-card", "bg-card"]);
  });

  it("takes the family tone for a family theme and keeps an explicit sale tint", () => {
    const tiles = resolvePromoTiles([
      tileBanner("w", "Ремінці", null, "watch"),
      tileBanner("s", "Розпродаж", null, "sale"),
      tileBanner("x", "Щось", null, "rainbow"),
    ]);

    expect(tiles.map((t) => t.tone)).toEqual([
      "bg-family-watch",
      "bg-sale/10",
      "bg-card",
    ]);
  });
});

describe("PromoTiles — banner pictures (TASK-740)", () => {
  it("puts an uploaded picture behind its own tile only", () => {
    const imageUrl = "http://localhost:3001/uploads/banners/tile-1.webp";
    renderShowcase([
      tileBanner("t1", "Скло зі знижкою", imageUrl),
      tileBanner("t2", "Павербанки", null),
    ]);

    const withPicture = screen.getByRole("link", { name: /Скло зі знижкою/ });
    const img = withPicture.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img?.getAttribute("src")).toContain(encodeURIComponent(imageUrl));

    const withoutPicture = screen.getByRole("link", { name: /Павербанки/ });
    expect(withoutPicture.querySelector("img")).toBeNull();
  });
});

describe("PromoTiles — real links only (TASK-873)", () => {
  it("renders a banner without a link as a plain card, not an `#` link", () => {
    const { container } = renderShowcase([
      { ...tileBanner("t1", "Без посилання"), ctaHref: null },
      tileBanner("t2", "З посиланням"),
    ]);

    expect(container.querySelector('a[href="#"]')).toBeNull();
    expect(screen.getByText("Без посилання").closest("a")).toBeNull();
    expect(screen.getByRole("link", { name: /З посиланням/ })).toHaveAttribute(
      "href",
      "/promo",
    );
  });

  it("points every fallback tile at a real page", () => {
    const { container } = renderShowcase();

    const links = Array.from(container.querySelectorAll("a"));
    expect(links).toHaveLength(dict.home.promoTiles.length);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^\/[a-z]/);
    }
  });
});
