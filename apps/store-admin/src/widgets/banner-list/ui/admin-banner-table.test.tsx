import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminBannerTable } from "./admin-banner-table";

// useSearchParams is unavailable under jsdom — mock the URL state. `mockSearchParams`
// is mutable so the TASK-264-C deep-link cases can seed `?placement=`; it resets to
// empty before each test, so the existing "no param" cases render the full view.
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockSearchParams = new URLSearchParams("");
});

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

describe("AdminBannerTable — ?placement= deep link (TASK-264-C)", () => {
  it("renders only the matching section when ?placement= names a real placement", async () => {
    mockSearchParams = new URLSearchParams("placement=HERO_SLIDE");
    stubBanners([
      makeBannerRow("banner-1", "Summer Hero", "HERO_SLIDE", "PUBLISHED"),
      makeBannerRow("banner-2", "Glass Promo", "PROMO_TILE", "DRAFT"),
      makeBannerRow("banner-3", "Top Strip", "ANNOUNCEMENT_BAR", "PUBLISHED"),
    ]);

    renderWithProviders(<AdminBannerTable />);

    // Only the Hero section renders…
    await waitFor(() =>
      expect(
        screen.getByText(dict.banners.placements.HERO_SLIDE),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Summer Hero")).toBeInTheDocument();
    // …the other placements' headings and rows are absent even though the
    // response included banners for them.
    expect(
      screen.queryByText(dict.banners.placements.PROMO_TILE),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(dict.banners.placements.ANNOUNCEMENT_BAR),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Glass Promo")).not.toBeInTheDocument();
    expect(screen.queryByText("Top Strip")).not.toBeInTheDocument();
  });

  it("falls back to the full grouped view for an unrecognized ?placement= value", async () => {
    mockSearchParams = new URLSearchParams("placement=NOT_REAL");
    stubBanners([
      makeBannerRow("banner-1", "Summer Hero", "HERO_SLIDE", "PUBLISHED"),
      makeBannerRow("banner-2", "Glass Promo", "PROMO_TILE", "DRAFT"),
    ]);

    renderWithProviders(<AdminBannerTable />);

    await waitFor(() =>
      expect(
        screen.getByText(dict.banners.placements.HERO_SLIDE),
      ).toBeInTheDocument(),
    );
    // Both sections render — the invalid param is ignored, not rendered empty.
    expect(
      screen.getByText(dict.banners.placements.PROMO_TILE),
    ).toBeInTheDocument();
    expect(screen.getByText("Summer Hero")).toBeInTheDocument();
    expect(screen.getByText("Glass Promo")).toBeInTheDocument();
  });
});
