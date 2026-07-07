import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, within } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ContentMapView } from "./content-map-view";

type Placement =
  | "HERO_SLIDE"
  | "PROMO_TILE"
  | "PROMO_BANNER"
  | "ANNOUNCEMENT_BAR";

/** Minimal banner row — only `placement` is read by the count filter. */
function bannerRow(id: string, placement: Placement) {
  return { id, placement, title: id, status: "PUBLISHED", sortOrder: 0 };
}

/** Minimal FAQ row — only `isActive` is read by the count filter. */
function faqRow(id: string, isActive: boolean) {
  return { id, question: id, answer: id, sortOrder: 0, isActive };
}

/** Stub all four content-map count endpoints for a test. */
function stubCounts(opts: {
  banners: ReturnType<typeof bannerRow>[];
  faq: ReturnType<typeof faqRow>[];
  pagesTotal: number;
  blogTotal: number;
}) {
  server.use(
    http.get("*/api/admin/banners", () =>
      HttpResponse.json({ data: opts.banners }),
    ),
    http.get("*/api/admin/faq", () => HttpResponse.json({ data: opts.faq })),
    http.get("*/api/admin/pages", () =>
      HttpResponse.json({
        data: [],
        meta: { total: opts.pagesTotal, page: 1, limit: 1, totalPages: 1 },
      }),
    ),
    http.get("*/api/admin/blog/posts", () =>
      HttpResponse.json({
        data: [],
        meta: { total: opts.blogTotal, page: 1, limit: 1, totalPages: 1 },
      }),
    ),
  );
}

/** Locate a zone card by its stable `data-zone-id`. */
function zoneCard(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector(`[data-zone-id="${id}"]`);
  if (!el) throw new Error(`zone card not found: ${id}`);
  return el as HTMLElement;
}

describe("ContentMapView — counts (TASK-264-B)", () => {
  it("derives all four banner-placement counts from one banner response", async () => {
    stubCounts({
      banners: [
        bannerRow("a1", "ANNOUNCEMENT_BAR"),
        bannerRow("a2", "ANNOUNCEMENT_BAR"),
        bannerRow("h1", "HERO_SLIDE"),
        bannerRow("p1", "PROMO_BANNER"),
        bannerRow("p2", "PROMO_BANNER"),
        bannerRow("p3", "PROMO_BANNER"),
      ],
      faq: [],
      pagesTotal: 0,
      blogTotal: 0,
    });

    const { container } = renderWithProviders(<ContentMapView />);

    const announcement = zoneCard(container, "announcement-bar");
    expect(await within(announcement).findByText("2")).toBeInTheDocument();
    expect(
      within(announcement).getByText(dict.contentMap.statusShown),
    ).toBeInTheDocument();

    expect(
      within(zoneCard(container, "hero-slide")).getByText("1"),
    ).toBeInTheDocument();
    // PROMO_TILE has no banners → count 0 → hidden.
    const promoTile = zoneCard(container, "promo-tile");
    expect(within(promoTile).getByText("0")).toBeInTheDocument();
    expect(
      within(promoTile).getByText(dict.contentMap.statusHidden),
    ).toBeInTheDocument();
    expect(
      within(zoneCard(container, "promo-banner")).getByText("3"),
    ).toBeInTheDocument();
  });

  it("counts only active FAQ rows and reads pages/blog meta.total", async () => {
    stubCounts({
      banners: [],
      faq: [faqRow("f1", true), faqRow("f2", true), faqRow("f3", false)],
      pagesTotal: 4,
      blogTotal: 7,
    });

    const { container } = renderWithProviders(<ContentMapView />);

    const faq = zoneCard(container, "faq");
    // 2 active of 3 rows.
    expect(await within(faq).findByText("2")).toBeInTheDocument();
    expect(
      within(faq).getByText(dict.contentMap.statusShown),
    ).toBeInTheDocument();

    expect(
      within(zoneCard(container, "legal-pages")).getByText("4"),
    ).toBeInTheDocument();
    expect(
      within(zoneCard(container, "blog")).getByText("7"),
    ).toBeInTheDocument();
  });

  it("shows Приховано for a zero count and Показується for a positive one", async () => {
    stubCounts({
      banners: [bannerRow("h1", "HERO_SLIDE")],
      faq: [],
      pagesTotal: 0,
      blogTotal: 0,
    });

    const { container } = renderWithProviders(<ContentMapView />);

    const hero = zoneCard(container, "hero-slide");
    expect(await within(hero).findByText("1")).toBeInTheDocument();
    expect(
      within(hero).getByText(dict.contentMap.statusShown),
    ).toBeInTheDocument();

    const blog = zoneCard(container, "blog");
    expect(within(blog).getByText("0")).toBeInTheDocument();
    expect(
      within(blog).getByText(dict.contentMap.statusHidden),
    ).toBeInTheDocument();
  });

  it("renders settings-singleton zones as a link with no count or marker", async () => {
    stubCounts({ banners: [], faq: [], pagesTotal: 0, blogTotal: 0 });

    const { container } = renderWithProviders(<ContentMapView />);

    // Wait for the page to settle so any (wrongly) rendered marker would exist.
    await within(zoneCard(container, "blog")).findByText("0");

    for (const [id, target] of [
      ["site-contact", dict.contentMap.zones.siteContact.target],
      ["seo-settings", dict.contentMap.zones.seoSettings.target],
    ] as const) {
      const card = zoneCard(container, id);
      expect(
        within(card).getByRole("link", { name: target }),
      ).toBeInTheDocument();
      expect(
        within(card).queryByText(dict.contentMap.statusShown),
      ).not.toBeInTheDocument();
      expect(
        within(card).queryByText(dict.contentMap.statusHidden),
      ).not.toBeInTheDocument();
      expect(
        within(card).queryByLabelText(/Активних елементів/),
      ).not.toBeInTheDocument();
    }
  });

  it("links each banner zone to its ?placement= deep link", async () => {
    stubCounts({ banners: [], faq: [], pagesTotal: 0, blogTotal: 0 });

    const { container } = renderWithProviders(<ContentMapView />);
    await within(zoneCard(container, "blog")).findByText("0");

    const heroLink = within(zoneCard(container, "hero-slide")).getByRole(
      "link",
    );
    expect(heroLink).toHaveAttribute("href", "/banners?placement=HERO_SLIDE");
  });

  it("degrades only the failing zone's count while other counts and all links keep working", async () => {
    server.use(
      http.get("*/api/admin/banners", () => HttpResponse.json({ data: [] })),
      http.get("*/api/admin/faq", () =>
        HttpResponse.json({ data: [faqRow("f1", true)] }),
      ),
      http.get("*/api/admin/pages", () =>
        HttpResponse.json({
          data: [],
          meta: { total: 2, page: 1, limit: 1, totalPages: 1 },
        }),
      ),
      // Blog count endpoint is down.
      http.get(
        "*/api/admin/blog/posts",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const { container } = renderWithProviders(<ContentMapView />);

    const blog = zoneCard(container, "blog");
    expect(
      await within(blog).findByText(dict.contentMap.loadError),
    ).toBeInTheDocument();
    // The blog target link still renders despite the failed count.
    expect(
      within(blog).getByRole("link", {
        name: dict.contentMap.zones.blog.target,
      }),
    ).toBeInTheDocument();

    // Other zones' counts are unaffected.
    expect(
      await within(zoneCard(container, "faq")).findByText("1"),
    ).toBeInTheDocument();
    expect(
      within(zoneCard(container, "legal-pages")).getByText("2"),
    ).toBeInTheDocument();
  });

  it("renders the static catalog/PDP note", async () => {
    stubCounts({ banners: [], faq: [], pagesTotal: 0, blogTotal: 0 });

    renderWithProviders(<ContentMapView />);

    expect(
      await screen.findByText(dict.contentMap.catalogNote),
    ).toBeInTheDocument();
  });
});
