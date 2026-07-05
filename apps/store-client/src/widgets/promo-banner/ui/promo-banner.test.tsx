import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { BannerEntity } from "@/shared/api/generated/models";
import { PromoBanner } from "./promo-banner";

function makeBanner(overrides: Partial<BannerEntity> = {}): BannerEntity {
  return {
    id: "banner-1",
    placement: "PROMO_BANNER",
    title: "Custom promo title",
    subtitle: "Custom promo subtitle",
    imageUrl: null,
    imageBlurDataUrl: null,
    ctaLabel: "Custom CTA",
    ctaHref: "/custom",
    theme: null,
    sortOrder: 0,
    status: "PUBLISHED",
    publishedAt: "2026-07-01T00:00:00.000Z",
    scheduledAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("PromoBanner", () => {
  it("falls back to the hardcoded wide-promo copy when no banner is given", () => {
    renderWithProviders(<PromoBanner />);

    expect(screen.getByText(dict.home.widePromo.title)).toBeInTheDocument();
    expect(screen.getByText(dict.home.widePromo.eyebrow)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: new RegExp(dict.home.widePromo.cta) }),
    ).toHaveAttribute("href", dict.home.widePromo.href);
  });

  it("renders the admin banner content when one is provided", () => {
    renderWithProviders(<PromoBanner banner={makeBanner()} />);

    expect(screen.getByText("Custom promo title")).toBeInTheDocument();
    expect(screen.getByText("Custom promo subtitle")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Custom CTA/ })).toHaveAttribute(
      "href",
      "/custom",
    );
    // The banner has no eyebrow, so the fallback eyebrow must not leak in.
    expect(
      screen.queryByText(dict.home.widePromo.eyebrow),
    ).not.toBeInTheDocument();
  });

  it("omits the CTA button when the banner has no label/href", () => {
    renderWithProviders(
      <PromoBanner banner={makeBanner({ ctaLabel: null, ctaHref: null })} />,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
