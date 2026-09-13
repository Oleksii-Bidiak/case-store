import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, within } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ContentMapView } from "./content-map-view";

type Placement =
  "HERO_SLIDE" | "PROMO_TILE" | "PROMO_BANNER" | "ANNOUNCEMENT_BAR";

/** Minimal banner row — only `placement` is read by the count filter. */
function bannerRow(id: string, placement: Placement) {
  return { id, placement, title: id, status: "PUBLISHED", sortOrder: 0 };
}

/** Minimal FAQ row — only `isActive` is read by the count filter. */
function faqRow(id: string, isActive: boolean) {
  return { id, question: id, answer: id, sortOrder: 0, isActive };
}

/**
 * Minimal page row — only `kind` is read by the count filter. Since TASK-435 the
 * page counts are grouped per kind from ONE response (as the banner placements
 * already were), so the stub returns rows rather than a bare total.
 */
function pageRow(id: string, kind: "LEGAL" | "INFO" | "HUB") {
  return { id, slug: id, kind, title: id, status: "PUBLISHED", sortOrder: 0 };
}

/** Stub all four content-map count endpoints for a test. */
function stubCounts(opts: {
  banners: ReturnType<typeof bannerRow>[];
  faq: ReturnType<typeof faqRow>[];
  pages: ReturnType<typeof pageRow>[];
  blogTotal: number;
}) {
  server.use(
    http.get("*/api/admin/banners", () =>
      HttpResponse.json({ data: opts.banners }),
    ),
    http.get("*/api/admin/faq", () => HttpResponse.json({ data: opts.faq })),
    http.get("*/api/admin/pages", () =>
      HttpResponse.json({
        data: opts.pages,
        meta: {
          total: opts.pages.length,
          page: 1,
          limit: 100,
          totalPages: 1,
        },
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
      pages: [],
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

  it("counts only active FAQ rows and reads the blog meta.total", async () => {
    stubCounts({
      banners: [],
      faq: [faqRow("f1", true), faqRow("f2", true), faqRow("f3", false)],
      pages: [],
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
      within(zoneCard(container, "blog")).getByText("7"),
    ).toBeInTheDocument();
  });

  // TASK-435 — three page zones off ONE request. Counting them together would
  // show the same number three times and tell the owner nothing about which
  // section actually has content.
  it("splits the page count per kind: legal, help and hub rows each get their own", async () => {
    stubCounts({
      banners: [],
      faq: [],
      pages: [
        pageRow("privacy-policy", "LEGAL"),
        pageRow("offer", "LEGAL"),
        pageRow("terms", "LEGAL"),
        pageRow("about", "INFO"),
        pageRow("blog", "HUB"),
        pageRow("promo", "HUB"),
      ],
      blogTotal: 0,
    });

    const { container } = renderWithProviders(<ContentMapView />);

    expect(
      await within(zoneCard(container, "legal-pages")).findByText("3"),
    ).toBeInTheDocument();
    expect(
      within(zoneCard(container, "info-pages")).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(zoneCard(container, "hub-pages")).getByText("2"),
    ).toBeInTheDocument();
  });

  it("deep-links each page zone to its own tab on the Pages screen", async () => {
    stubCounts({ banners: [], faq: [], pages: [], blogTotal: 0 });

    const { container } = renderWithProviders(<ContentMapView />);
    await within(zoneCard(container, "blog")).findByText("0");

    for (const [id, kind] of [
      ["legal-pages", "LEGAL"],
      ["info-pages", "INFO"],
      ["hub-pages", "HUB"],
    ] as const) {
      expect(within(zoneCard(container, id)).getByRole("link")).toHaveAttribute(
        "href",
        `/pages?kind=${kind}`,
      );
    }
  });

  it("shows Приховано for a zero count and Показується for a positive one", async () => {
    stubCounts({
      banners: [bannerRow("h1", "HERO_SLIDE")],
      faq: [],
      pages: [],
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
    stubCounts({ banners: [], faq: [], pages: [], blogTotal: 0 });

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

  // AD-CNT-26 (TASK-429): the storefront /promo page was missing from the map
  // entirely, so nothing in the admin panel said that «Промокоди» drives it.
  it("puts the /promo page on the map, linking to /discounts with no count badge", async () => {
    stubCounts({ banners: [], faq: [], pages: [], blogTotal: 0 });

    const { container } = renderWithProviders(<ContentMapView />);
    // Let the page settle so a wrongly rendered marker would be present.
    await within(zoneCard(container, "blog")).findByText("0");

    const card = zoneCard(container, "promo-codes");
    expect(
      within(card).getByRole("link", {
        name: dict.contentMap.zones.promoCodes.target,
      }),
    ).toHaveAttribute("href", "/discounts");
    // Its count lives behind another permission zone, so no badge is fetched —
    // and, crucially, no error badge either.
    expect(
      within(card).queryByText(dict.contentMap.loadError),
    ).not.toBeInTheDocument();
    expect(
      within(card).queryByLabelText(/Активних елементів/),
    ).not.toBeInTheDocument();
  });

  it("links each banner zone to its ?placement= deep link", async () => {
    stubCounts({ banners: [], faq: [], pages: [], blogTotal: 0 });

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
          data: [pageRow("offer", "LEGAL"), pageRow("terms", "LEGAL")],
          meta: { total: 2, page: 1, limit: 100, totalPages: 1 },
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
    stubCounts({ banners: [], faq: [], pages: [], blogTotal: 0 });

    renderWithProviders(<ContentMapView />);

    expect(
      await screen.findByText(dict.contentMap.catalogNote),
    ).toBeInTheDocument();
  });
});
