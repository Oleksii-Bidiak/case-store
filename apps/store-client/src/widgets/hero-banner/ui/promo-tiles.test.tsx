import { render, screen } from "@testing-library/react";
import type { BannerEntity } from "@/shared/api/generated/models";
import { PromoTiles } from "./promo-tiles";

function tileBanner(
  id: string,
  title: string,
  imageUrl: string | null,
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
    theme: null,
    sortOrder: 0,
    status: "PUBLISHED",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

describe("PromoTiles — banner pictures (TASK-740)", () => {
  it("puts an uploaded picture behind its own tile only", () => {
    const imageUrl = "http://localhost:3001/uploads/banners/tile-1.webp";
    render(
      <PromoTiles
        banners={[
          tileBanner("t1", "Скло зі знижкою", imageUrl),
          tileBanner("t2", "Павербанки", null),
        ]}
      />,
    );

    const withPicture = screen.getByRole("link", { name: /Скло зі знижкою/ });
    const img = withPicture.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img?.getAttribute("src")).toContain(encodeURIComponent(imageUrl));

    const withoutPicture = screen.getByRole("link", { name: /Павербанки/ });
    expect(withoutPicture.querySelector("img")).toBeNull();
  });
});
