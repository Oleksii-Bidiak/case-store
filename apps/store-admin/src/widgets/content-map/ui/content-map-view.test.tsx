/**
 * «Де що на сайті» (TASK-264; tabs by storefront page, the page schema and the
 * zone cards of wave 198 — ContentMapProposal ДЩ1–ДЩ4, TASK-1076).
 */

import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { PERM } from "@/entities/permission";
import { formatDate } from "@/shared/lib";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { ContentMapView } from "./content-map-view";

const c = dict.contentMap;
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

type Placement =
  "HERO_SLIDE" | "PROMO_TILE" | "PROMO_BANNER" | "ANNOUNCEMENT_BAR";

function bannerRow(
  id: string,
  placement: Placement,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    placement,
    title: id,
    status: "PUBLISHED",
    sortOrder: 0,
    ...extra,
  };
}

function pageRow(id: string, kind: "LEGAL" | "INFO" | "HUB") {
  return { id, slug: id, kind, title: id, status: "PUBLISHED", sortOrder: 0 };
}

/** Every source the map reads, stubbed; override per test with `server.use`. */
function stubAll(
  opts: {
    banners?: ReturnType<typeof bannerRow>[];
    faqActive?: number;
    pages?: ReturnType<typeof pageRow>[];
    blogTotal?: number;
  } = {},
) {
  const requests: string[] = [];
  const track = (request: Request) => {
    requests.push(new URL(request.url).pathname);
  };
  server.use(
    http.get("*/api/admin/banners", ({ request }) => {
      track(request);
      return HttpResponse.json({ data: opts.banners ?? [] });
    }),
    http.get("*/api/admin/faq", ({ request }) => {
      track(request);
      return HttpResponse.json({
        data: Array.from({ length: opts.faqActive ?? 0 }, (_, i) => ({
          id: `f${i}`,
          question: "q",
          answer: "a",
          sortOrder: i,
          isActive: true,
        })),
      });
    }),
    http.get("*/api/admin/pages", ({ request }) => {
      track(request);
      const pages = opts.pages ?? [];
      return HttpResponse.json({
        data: pages,
        meta: { total: pages.length, page: 1, limit: 100, totalPages: 1 },
      });
    }),
    http.get("*/api/admin/blog/posts", ({ request }) => {
      track(request);
      return HttpResponse.json({
        data: [],
        meta: { total: opts.blogTotal ?? 0, page: 1, limit: 1, totalPages: 1 },
      });
    }),
    http.get("*/api/admin/carousels", ({ request }) => {
      track(request);
      return HttpResponse.json({
        data: [
          ["Хіти", "HOME_TABS", 0],
          ["Новинки", "HOME_TABS", 1],
          ["Акційні", "HOME_TABS", 2],
          ["Чохли для смартфонів", "HOME_RAILS", 0],
        ].map(([title, placement, sortOrder]) => ({
          id: String(title),
          title,
          placement,
          sortOrder,
          status: "PUBLISHED",
        })),
        meta: { total: 4, page: 1, limit: 100, totalPages: 1 },
      });
    }),
    http.get("*/api/site-contact", ({ request }) => {
      track(request);
      return HttpResponse.json({
        data: {
          id: "x",
          phone: "+380",
          email: "shop@example.com",
          workingHours: "9–18",
          viberLink: "viber://x",
          telegramLink: null,
          instagramLink: "https://instagram.com/x",
          createdAt: "",
          updatedAt: "",
        },
      });
    }),
    http.get("*/api/discounts/active", ({ request }) => {
      track(request);
      return HttpResponse.json({
        data: [{ code: "SUMMER500" }, { code: "AUTUMN" }],
      });
    }),
    http.get("*/api/admin/discounts", ({ request }) => {
      track(request);
      return HttpResponse.json({
        data: [
          {
            code: "OLD",
            isActive: true,
            showOnPromoPage: true,
            expiresAt: iso(Date.now() - DAY),
          },
        ],
        meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
      });
    }),
    http.get("*/api/products/admin/list", ({ request }) => {
      track(request);
      return HttpResponse.json({
        data: [],
        meta: { total: 9, page: 1, limit: 1, totalPages: 9 },
      });
    }),
    http.get("*/api/admin/seo-settings/health", ({ request }) => {
      track(request);
      return HttpResponse.json({
        data: {
          productsMissingMetaTitle: 0,
          productsTotal: 0,
          categoriesMissingMetaTitle: 0,
          categoriesTotal: 0,
          pagesMissingMetaTitle: 0,
          pagesTotal: 0,
          pagesMissingMetaDescription: 0,
          pagesThinContent: 4,
        },
      });
    }),
  );
  return requests;
}

function renderMap(permissions?: string[]) {
  return renderWithProviders(
    permissions ? (
      <WithAuth permissions={permissions}>
        <ContentMapView />
      </WithAuth>
    ) : (
      <WithAuth isOwner>
        <ContentMapView />
      </WithAuth>
    ),
  );
}

const tab = (label: string) =>
  screen.getByRole("tab", { name: new RegExp(`^${label}`) });

/** A zone card by its stable `data-zone-id` on the open tab. */
function zoneCard(id: string): HTMLElement {
  const el = document.querySelector(`[data-zone-id="${id}"]`);
  if (!el) throw new Error(`zone card not found: ${id}`);
  return el as HTMLElement;
}

describe("ContentMapView — tabs and the page schema (ДЩ1)", () => {
  it("offers the six storefront pages as tabs, each counting its zones", async () => {
    stubAll();
    renderMap();

    expect(tab(c.tabs.home)).toHaveTextContent("7");
    expect(tab(c.tabs.all)).toHaveTextContent("4");
    expect(tab(c.tabs.promo)).toHaveTextContent("2");
    expect(tab(c.tabs.info)).toHaveTextContent("2");
    expect(tab(c.tabs.blog)).toHaveTextContent("1");
    expect(tab(c.tabs.legal)).toHaveTextContent("1");
    expect(tab(c.tabs.home)).toHaveAttribute("aria-selected", "true");
  });

  it("lists the home zones in page order, numbered like the schema", async () => {
    stubAll();
    renderMap();

    const list = await screen.findByRole("list", { name: c.tabs.home });
    const titles = within(list)
      .getAllByRole("listitem")
      .map((item) => item.getAttribute("data-zone-id"));
    expect(titles).toEqual([
      "announcement-bar",
      "hero-slide",
      "promo-tile",
      "carousel-tabs",
      "promo-banner",
      "carousel-rails",
      "site-contact",
    ]);
    expect(
      within(zoneCard("site-contact")).getByText(c.contactsFooter),
    ).toBeInTheDocument();
  });

  it("selecting a schema block highlights it and its card", async () => {
    stubAll();
    renderMap();

    const block = screen.getByRole("button", {
      name: c.blockAria(2, dict.contentMap.zones.heroSlide.source),
    });
    await userEvent.click(block);

    expect(block).toHaveAttribute("aria-pressed", "true");
    expect(zoneCard("hero-slide")).toHaveAttribute("data-selected", "true");
    expect(zoneCard("promo-tile")).toHaveAttribute("data-selected", "false");
  });

  it("folds the schema behind «Показати схему сторінки» on a phone", async () => {
    stubAll();
    renderMap();

    const toggle = screen.getByRole("button", { name: c.schemaShow });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: c.schemaHide })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("renders the catalog note", async () => {
    stubAll();
    renderMap();

    expect(await screen.findByText(c.catalogNote)).toBeInTheDocument();
  });
});

describe("ContentMapView — zone state (ДЩ1–ДЩ3)", () => {
  it("counts banners per placement from ONE response, with the end date", async () => {
    const until = Date.now() + 3 * DAY + 60_000;
    stubAll({
      banners: [
        bannerRow("a1", "ANNOUNCEMENT_BAR", { scheduledUntil: iso(until) }),
        bannerRow("h1", "HERO_SLIDE"),
        bannerRow("h2", "HERO_SLIDE"),
        bannerRow("t1", "PROMO_TILE"),
        bannerRow("t2", "PROMO_TILE", {
          status: "SCHEDULED",
          scheduledAt: iso(Date.now() + 5 * DAY),
        }),
      ],
    });
    renderMap();

    await waitFor(() =>
      expect(
        within(zoneCard("hero-slide")).getByText(c.shown(2)),
      ).toBeInTheDocument(),
    );
    expect(
      within(zoneCard("announcement-bar")).getByText(
        c.endsBadge(formatDate(iso(until)).slice(0, 5), 4),
      ),
    ).toBeInTheDocument();
    expect(
      within(zoneCard("promo-tile")).getByText(
        `${c.shown(1)} · ${c.scheduled(1)}`,
      ),
    ).toBeInTheDocument();
    expect(
      within(zoneCard("promo-banner")).getByText(c.shown(0)),
    ).toBeInTheDocument();
  });

  it("names the live carousels and tags them for the later /home screen", async () => {
    stubAll();
    renderMap();

    expect(
      await within(zoneCard("carousel-tabs")).findByText(
        c.carouselTabsState(3, "Хіти, Новинки, Акційні"),
      ),
    ).toBeInTheDocument();
    expect(
      within(zoneCard("carousel-tabs")).getByText(c.laterTag),
    ).toBeInTheDocument();
    expect(
      within(zoneCard("carousel-rails")).getByText(
        c.carouselRailsState(1, "«Чохли для смартфонів»"),
      ),
    ).toBeInTheDocument();
  });

  it("says what the contacts form has filled", async () => {
    stubAll();
    renderMap();

    expect(
      await within(zoneCard("site-contact")).findByText(
        [
          c.contactParts.phone,
          c.contactParts.email,
          c.contactParts.hours,
          c.contactParts.messengers(1),
          c.contactParts.instagram,
        ].join(", "),
      ),
    ).toBeInTheDocument();
  });

  it("«На кожній сторінці»: SEO warnings and the hub count", async () => {
    stubAll({
      pages: [
        pageRow("h1", "HUB"),
        pageRow("h2", "HUB"),
        pageRow("l", "LEGAL"),
      ],
    });
    renderMap();
    await userEvent.click(tab(c.tabs.all));

    // Defaults empty (shared stub) + thin pages = 2 warnings.
    expect(
      await within(zoneCard("seo-settings")).findByText(c.seoWarnings(2)),
    ).toBeInTheDocument();
    expect(
      within(zoneCard("seo-settings")).getByText(c.seoCheck),
    ).toBeInTheDocument();
    expect(
      within(zoneCard("hub-pages")).getByText(c.hubs(2)),
    ).toBeInTheDocument();
    // Invisible on the page — no «на сайті».
    expect(
      within(zoneCard("seo-settings")).queryByRole("link", {
        name: c.onSiteAria(dict.contentMap.zones.seoSettings.source),
      }),
    ).not.toBeInTheDocument();
  });

  it("«Акції»: what /promo shows, expired codes, and the sale count", async () => {
    stubAll();
    renderMap();
    await userEvent.click(tab(c.tabs.promo));

    expect(
      await within(zoneCard("promo-codes")).findByText(
        c.promoShown(2, "SUMMER500, AUTUMN"),
      ),
    ).toBeInTheDocument();
    expect(
      await within(zoneCard("promo-codes")).findByText(c.promoExpired(1)),
    ).toBeInTheDocument();
    expect(
      await within(zoneCard("sale-products")).findByText(
        c.saleProductsState(9),
      ),
    ).toBeInTheDocument();
  });

  it("the other tabs count FAQ, help pages, posts and legal documents", async () => {
    stubAll({
      faqActive: 5,
      pages: [
        pageRow("i1", "INFO"),
        pageRow("l1", "LEGAL"),
        pageRow("l2", "LEGAL"),
      ],
      blogTotal: 12,
    });
    renderMap();

    await userEvent.click(tab(c.tabs.info));
    expect(
      await within(zoneCard("faq")).findByText(c.shown(5)),
    ).toBeInTheDocument();
    expect(
      within(zoneCard("info-pages")).getByText(c.infoPagesState(1)),
    ).toBeInTheDocument();

    await userEvent.click(tab(c.tabs.blog));
    expect(
      await within(zoneCard("blog")).findByText(c.blogState(12)),
    ).toBeInTheDocument();

    await userEvent.click(tab(c.tabs.legal));
    expect(
      await within(zoneCard("legal-pages")).findByText(c.legalPagesState(2)),
    ).toBeInTheDocument();
  });

  it("degrades only the failing source while other states and every link keep working", async () => {
    stubAll({ faqActive: 1 });
    server.use(
      http.get(
        "*/api/admin/banners",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderMap();

    expect(
      await within(zoneCard("hero-slide")).findByText(c.loadError),
    ).toBeInTheDocument();
    expect(
      within(zoneCard("hero-slide")).getByRole("link", {
        name: c.editAria(
          dict.contentMap.zones.heroSlide.source,
          dict.contentMap.zones.heroSlide.target,
        ),
      }),
    ).toHaveAttribute("href", "/banners?placement=HERO_SLIDE");
    expect(
      await within(zoneCard("carousel-tabs")).findByText(
        c.carouselTabsState(3, "Хіти, Новинки, Акційні"),
      ),
    ).toBeInTheDocument();
  });
});

describe("ContentMapView — links (ДЩ1)", () => {
  it("links every zone to its section and live zones to the site", async () => {
    stubAll();
    renderMap();

    const hero = zoneCard("hero-slide");
    expect(
      within(hero).getByRole("link", {
        name: c.editAria(
          dict.contentMap.zones.heroSlide.source,
          dict.contentMap.zones.heroSlide.target,
        ),
      }),
    ).toHaveAttribute("href", "/banners?placement=HERO_SLIDE");
    const site = within(hero).getByRole("link", {
      name: c.onSiteAria(dict.contentMap.zones.heroSlide.source),
    });
    expect(site).toHaveAttribute("href", `${STOREFRONT_URL}/`);
    expect(site).toHaveAttribute("target", "_blank");

    await userEvent.click(tab(c.tabs.all));
    expect(
      within(zoneCard("hub-pages")).getByRole("link", {
        name: c.editAria(
          dict.contentMap.zones.hubPages.source,
          dict.contentMap.zones.hubPages.target,
        ),
      }),
    ).toHaveAttribute("href", "/pages?kind=HUB");

    await userEvent.click(tab(c.tabs.promo));
    expect(
      within(zoneCard("promo-codes")).getByRole("link", {
        name: c.editAria(
          dict.contentMap.zones.promoCodes.source,
          dict.contentMap.zones.promoCodes.target,
        ),
      }),
    ).toHaveAttribute("href", "/discounts");
  });

  // TASK-719: every target must start with a real sidebar label, and a
  // `→ Tab` suffix must name a real view of the Pages screen.
  it("names only sidebar items (and Pages views) that exist", () => {
    const sidebar = new Set<string>([
      ...Object.values(dict.nav),
      dict.carousels.navLabel,
    ]);
    const pageTabs = new Set<string>([
      dict.pages.tabLegal,
      dict.pages.tabInfo,
      dict.pages.tabHub,
    ]);

    for (const zone of Object.values(dict.contentMap.zones)) {
      const [section, view, ...rest] = zone.target.split(" → ");
      expect(rest).toEqual([]);
      expect(sidebar).toContain(section);
      if (view !== undefined) {
        expect(section).toBe(dict.nav.pages);
        expect(pageTabs).toContain(view);
      }
    }
  });
});

/**
 * The page is gated by the four content keys (the nav entry). The sources
 * behind OTHER keys are asked only when the session holds them — a content
 * manager gets the zone and its links, no number, and no 403 painted as an
 * error (the AD-CNT-26 lesson).
 */
describe("ContentMapView — permissions", () => {
  it("asks no source the session may not read, and shows those zones without a state", async () => {
    const requests = stubAll();
    renderMap([
      PERM.pagesWrite,
      PERM.bannersWrite,
      PERM.faqWrite,
      PERM.blogWrite,
    ]);

    await waitFor(() =>
      expect(requests).toEqual(
        expect.arrayContaining(["/api/admin/banners", "/api/admin/pages"]),
      ),
    );
    expect(requests).not.toContain("/api/admin/carousels");
    expect(requests).not.toContain("/api/admin/discounts");
    expect(requests).not.toContain("/api/products/admin/list");
    expect(requests).not.toContain("/api/admin/seo-settings/health");

    const rails = zoneCard("carousel-rails");
    expect(within(rails).queryByText(c.loadError)).not.toBeInTheDocument();
    expect(
      within(rails).getByRole("link", {
        name: c.editAria(
          dict.contentMap.zones.carouselRails.source,
          dict.contentMap.zones.carouselRails.target,
        ),
      }),
    ).toHaveAttribute("href", "/carousels");
  });
});
