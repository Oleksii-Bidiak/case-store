import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminBannerTable } from "./admin-banner-table";

type Placement =
  | "HERO_SLIDE"
  | "PROMO_TILE"
  | "PROMO_BANNER"
  | "ANNOUNCEMENT_BAR";
type Status = "DRAFT" | "SCHEDULED" | "PUBLISHED";

function makeBannerRow(
  id: string,
  title: string,
  placement: Placement,
  status: Status,
) {
  return {
    id,
    placement,
    title,
    subtitle: null,
    imageUrl: null,
    imageBlurDataUrl: null,
    ctaLabel: null,
    ctaHref: null,
    theme: null,
    sortOrder: 0,
    status,
    publishedAt: status === "PUBLISHED" ? "2026-07-01T00:00:00.000Z" : null,
    scheduledAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

function stubBanners(rows: ReturnType<typeof makeBannerRow>[]) {
  server.use(
    http.get("*/api/admin/banners", () => HttpResponse.json({ data: rows })),
  );
}

describe("AdminBannerTable", () => {
  it("renders banner rows grouped by placement with a section heading", async () => {
    stubBanners([
      makeBannerRow("banner-1", "Summer Hero", "HERO_SLIDE", "PUBLISHED"),
      makeBannerRow("banner-2", "Glass Promo", "PROMO_TILE", "DRAFT"),
    ]);

    renderWithProviders(<AdminBannerTable />);

    await waitFor(() =>
      expect(screen.getByText("Summer Hero")).toBeInTheDocument(),
    );
    expect(screen.getByText("Glass Promo")).toBeInTheDocument();
    expect(
      screen.getByText(dict.banners.placements.HERO_SLIDE),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.banners.placements.PROMO_TILE),
    ).toBeInTheDocument();
  });

  it("shows the published badge for published banners and draft for drafts", async () => {
    stubBanners([
      makeBannerRow("banner-1", "Summer Hero", "HERO_SLIDE", "PUBLISHED"),
      makeBannerRow("banner-2", "Glass Promo", "PROMO_TILE", "DRAFT"),
    ]);

    renderWithProviders(<AdminBannerTable />);

    await waitFor(() =>
      expect(
        screen.getByText(dict.banners.statusLabels.PUBLISHED),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(dict.banners.statusLabels.DRAFT),
    ).toBeInTheDocument();
  });

  it("renders an edit action linking to the banner edit route", async () => {
    stubBanners([
      makeBannerRow("banner-1", "Summer Hero", "HERO_SLIDE", "PUBLISHED"),
    ]);

    renderWithProviders(<AdminBannerTable />);

    const editLink = await screen.findByRole("link", {
      name: dict.common.edit,
    });
    expect(editLink).toHaveAttribute("href", "/banners/banner-1/edit");
  });

  it("shows the empty state when there are no banners", async () => {
    stubBanners([]);

    renderWithProviders(<AdminBannerTable />);

    await waitFor(() =>
      expect(screen.getByText(dict.banners.empty)).toBeInTheDocument(),
    );
  });
});
