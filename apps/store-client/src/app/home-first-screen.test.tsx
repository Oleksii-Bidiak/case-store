// TASK-1952 — the homepage first screen, rendered for real: the device
// picker (or the saved device's panel) first as the page h1, then «Акції»
// (slider + promo tiles), then «Чому ми». The server reads and the blocks
// below the first screen are stubbed; the three first-screen sections are
// the real widgets.
import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, within } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { MY_DEVICES_STORAGE_KEY, type MyDevice } from "@/entities/my-devices";
import type { DeviceModelListItemEntity } from "@/entities/device";
import HomePage from "./page";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/widgets", () => {
  const actual = jest.requireActual("@/widgets/hero-banner");
  const stub = () => null;
  return {
    HeroBanner: actual.HeroBanner,
    TrustStrip: actual.TrustStrip,
    CategoryNav: stub,
    PopularRail: stub,
    RecommendationCarousels: stub,
    PromoBanner: stub,
    RecentlyViewed: stub,
    Newsletter: stub,
    firstQueryTabParams: jest.requireActual(
      "@/widgets/product-grid/model/popular-tabs",
    ).firstQueryTabParams,
  };
});
jest.mock("@/shared/api/banners-server", () => ({
  fetchPublishedBanners: jest
    .fn()
    .mockResolvedValue({ HERO_SLIDE: [], PROMO_TILE: [], PROMO_BANNER: [] }),
}));
// No block from the API → the built-in order: HERO, TRUST, CATEGORY_NAV, …
jest.mock("@/shared/api/carousels-server", () => ({
  fetchHomeBlocks: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/shared/api/preview-server", () => ({
  readPreviewToken: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/shared/api/site-contact-server", () => ({
  fetchSiteContactSettings: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/shared/api/seo-settings-server", () => ({
  fetchSeoSettings: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/shared/api/generated/products/products", () => ({
  getProductControllerFindAllQueryOptions: (params: unknown) => ({
    queryKey: ["/api/products", params],
    queryFn: async () => ({ data: [], meta: {} }),
  }),
}));
jest.mock("@/shared/api/generated/categories/categories", () => ({
  getCategoryControllerGetRootCategoriesQueryOptions: (params: unknown) => ({
    queryKey: ["/api/categories", params],
    queryFn: async () => ({ data: [], meta: {} }),
  }),
}));

const hero = dict.devicePicker.hero;

function model(
  id: string,
  name: string,
  productCount: number,
): DeviceModelListItemEntity {
  return {
    id,
    deviceBrandId: "brand-apple",
    name,
    slug: id,
    series: null,
    releaseYear: 2023,
    brandName: "Apple",
    brandSlug: "apple",
    productCount,
  };
}

function product(id: string, name: string) {
  return {
    id,
    name,
    slug: id,
    description: null,
    price: "499.00",
    compareAtPrice: null,
    sku: id.toUpperCase(),
    inStock: true,
    lowStock: false,
    categoryId: "cat-1",
    groupId: null,
    attributes: {},
    positionOrder: 0,
    isActive: true,
    ratingAverage: 0,
    ratingCount: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    primaryImage: null,
    compatibleDeviceModelIds: ["iphone-15-pro"],
    variantSummary: {
      groupId: null,
      variantCount: 1,
      priceFrom: "499.00",
      defaultVariantId: id,
      defaultVariantSlug: id,
      defaultInStock: true,
      colors: [],
    },
  };
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  window.localStorage.clear();
  // Reduced motion: the slider never arms its autoplay timer.
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  server.use(
    http.get("*/api/device-models", () =>
      HttpResponse.json({
        data: [
          model("iphone-16-pro", "iPhone 16 Pro", 96),
          model("iphone-15-pro", "iPhone 15 Pro", 128),
        ],
      }),
    ),
    http.get("*/api/catalog/device-hubs/:slug", ({ params }) =>
      HttpResponse.json({
        data: {
          model: { id: params.slug, name: "iPhone 15 Pro", slug: params.slug },
          productCount: 128,
          groups: [
            {
              category: { id: "cat-cases", name: "Чохли", slug: "cases" },
              productCount: 44,
              products: [
                product("p1", "Чохол MagSafe"),
                product("p2", "Чохол силіконовий"),
              ],
            },
            {
              category: {
                id: "cat-glass",
                name: "Захисне скло",
                slug: "glass",
              },
              productCount: 15,
              products: [product("p3", "Скло 2.5D")],
            },
          ],
        },
      }),
    ),
  );
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

/** `a` stands before `b` in the document. */
function precedes(a: Element, b: Element): boolean {
  return Boolean(
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

async function renderHome() {
  renderWithProviders(await HomePage());
}

describe("homepage first screen (TASK-1952)", () => {
  it("opens with the device picker as the page's only h1, before «Акції» and «Чому ми»", async () => {
    await renderHome();

    const picker = screen.getByRole("region", { name: hero.sectionAria });
    const promo = screen.getByRole("region", { name: dict.home.promoAria });
    const trust = screen.getByRole("region", { name: dict.home.trustAria });

    // The first heading of the page is the picker's question, and it is the
    // one h1 — the slide titles step down to h2.
    const headings = screen.getAllByRole("heading");
    expect(headings[0]).toHaveAccessibleName(hero.title);
    expect(headings[0].tagName).toBe("H1");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      within(promo).getByRole("heading", {
        level: 2,
        name: dict.home.hero.slides[0].title,
      }),
    ).toBeInTheDocument();

    expect(precedes(picker, promo)).toBe(true);
    expect(precedes(promo, trust)).toBe(true);
  });

  it("shows the four «Чому ми» items as a plain list, never promising free delivery", async () => {
    await renderHome();

    const trust = screen.getByRole("region", { name: dict.home.trustAria });
    const items = within(trust).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("b")?.textContent)).toEqual(
      dict.home.trust.map((item) => item.title),
    );
    expect(trust.textContent).not.toMatch(/безкоштовн/i);
    expect(within(trust).queryByRole("link")).toBeNull();
    expect(within(trust).queryByRole("button")).toBeNull();
  });

  it("swaps in the saved device's panel, with its product rail, in the same first slot", async () => {
    const device: MyDevice = {
      modelId: "iphone-15-pro",
      slug: "iphone-15-pro",
      name: "iPhone 15 Pro",
      brandName: "Apple",
      family: "iphone",
      lastUsedAt: 1_000_000,
    } as MyDevice;
    window.localStorage.setItem(
      MY_DEVICES_STORAGE_KEY,
      JSON.stringify([device]),
    );

    await renderHome();

    const panel = await screen.findByRole("region", {
      name: hero.panelAria("iPhone 15 Pro"),
    });
    expect(
      within(panel).getByRole("heading", { level: 1, name: "iPhone 15 Pro" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      precedes(
        panel,
        screen.getByRole("region", { name: dict.home.promoAria }),
      ),
    ).toBe(true);

    // The rail: up to three catalogue cards, each with its own buy action.
    const rail = await within(panel).findByRole("list", {
      name: dict.home.devicePicksAria("iPhone 15 Pro"),
    });
    const cards = within(rail).getAllByRole("listitem");
    expect(cards).toHaveLength(3);
    for (const name of ["Чохол MagSafe", "Скло 2.5D", "Чохол силіконовий"]) {
      expect(within(rail).getByRole("link", { name })).toBeInTheDocument();
    }
  });
});
