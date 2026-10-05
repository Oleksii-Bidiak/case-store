import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { SearchResultsView } from "./search-results-view";
import { SearchResultsSkeleton } from "./search-results-skeleton";

// next/navigation is unavailable under jsdom — mock it with a mutable query so
// each test controls the URL the widget derives its filters from.
let currentQuery = "";
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/search",
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

/** The public tree the chips row and the slug → id lookup read (TASK-523). */
const CATEGORY_TREE = [
  {
    id: "cat-cases",
    name: "Чохли",
    slug: "cases",
    isActive: true,
    sortOrder: 0,
    updatedAt: "2026-06-01T00:00:00.000Z",
    children: [],
  },
  {
    id: "cat-power",
    name: "Зарядні",
    slug: "power",
    isActive: true,
    sortOrder: 1,
    updatedAt: "2026-06-01T00:00:00.000Z",
    children: [],
  },
];

/** Every brand-list request the panel made, for the category-scope test. */
let brandRequests: URL[] = [];
/** Every facet-list request — /search must never make one (TASK-523). */
let facetRequests: URL[] = [];

/**
 * The sidebar panel (TASK-417) fetches its own option lists. They are empty
 * here — this suite is about the results column and the URL contract, not about
 * the panel's internals, which `product-filters.test.tsx` owns.
 */
function installFilterPanelHandlers() {
  brandRequests = [];
  facetRequests = [];
  server.use(
    http.get("*/api/categories/tree", () =>
      HttpResponse.json({ data: CATEGORY_TREE }),
    ),
    http.get("*/api/categories/:id/filterable-specs", ({ request }) => {
      facetRequests.push(new URL(request.url));
      return HttpResponse.json({ data: [] });
    }),
    http.get("*/api/brands", ({ request }) => {
      brandRequests.push(new URL(request.url));
      return HttpResponse.json({ data: [] });
    }),
    http.get("*/api/device-brands", () => HttpResponse.json({ data: [] })),
    http.get("*/api/device-models", () => HttpResponse.json({ data: [] })),
    // `/api/wishlist` (asked by every card's heart) comes from the shared
    // default handlers (TASK-531).
  );
}

beforeEach(() => {
  currentQuery = "";
  mockReplace.mockClear();
  installFilterPanelHandlers();
});

// TASK-531: every card on the page asked for the wishlist and each miss logged
// an MSW "unhandled request" error. Keep the suite quiet — an unmocked request
// here is either a new default the shared handlers lack or a real regression.
const unhandledRequests: string[] = [];
function recordUnhandled({ request }: { request: Request }) {
  unhandledRequests.push(`${request.method} ${new URL(request.url).pathname}`);
}
beforeAll(() => server.events.on("request:unhandled", recordUnhandled));
afterAll(() =>
  server.events.removeListener("request:unhandled", recordUnhandled),
);
afterEach(() => {
  const seen = unhandledRequests.splice(0);
  expect(seen).toEqual([]);
});

function variantSummary(overrides: Record<string, unknown> = {}) {
  return {
    groupId: null,
    variantCount: 1,
    priceFrom: "29.99",
    defaultVariantId: "product-1",
    defaultVariantSlug: "iphone-15-case",
    defaultInStock: true,
    colors: [],
    ...overrides,
  };
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "product-1",
    name: "iPhone 15 Case",
    slug: "iphone-15-case",
    description: "Clear case",
    price: "29.99",
    compareAtPrice: null,
    sku: "IP-1",
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
    variantSummary: variantSummary(),
    ...overrides,
  };
}

function resultsEnvelope(
  products: ReturnType<typeof makeProduct>[],
  total = products.length,
) {
  return {
    data: products,
    meta: {
      total,
      page: 1,
      limit: 20,
      totalPages: Math.max(1, Math.ceil(total / 20)),
    },
  };
}

describe("SearchResultsView", () => {
  it("shows the search prompt (no request) when the query is blank", () => {
    renderWithProviders(<SearchResultsView query="" page={1} />);
    expect(screen.getByText(dict.search.promptHeading)).toBeInTheDocument();
    // design-system §6 (TASK-870): the prompt ends in ONE primary action.
    const cta = screen.getByRole("link", { name: dict.search.promptCta });
    expect(cta).toHaveAttribute("href", "/products");
    expect(cta).toHaveAttribute("data-variant", "default");
  });

  it("renders matching products for a query", async () => {
    server.use(
      http.get("*/api/search", () =>
        HttpResponse.json(resultsEnvelope([makeProduct()])),
      ),
    );

    renderWithProviders(<SearchResultsView query="айфон" page={1} />);

    expect(await screen.findByText("iPhone 15 Case")).toBeInTheDocument();
    expect(screen.getByText(dict.search.countFound(1))).toBeInTheDocument();
  });

  it("renders the empty state when there are no matches", async () => {
    server.use(
      http.get("*/api/search", () => HttpResponse.json(resultsEnvelope([], 0))),
    );

    renderWithProviders(<SearchResultsView query="zzz" page={1} />);

    expect(
      await screen.findByText(dict.search.emptyHeading("zzz")),
    ).toBeInTheDocument();
    // No filter narrowed it — the query itself found nothing, so the primary
    // action leads to the whole catalogue (TASK-870).
    const cta = screen.getByRole("link", { name: dict.search.browseAll });
    expect(cta).toHaveAttribute("href", "/products");
    expect(cta).toHaveAttribute("data-variant", "default");
    expect(
      screen.queryByRole("button", { name: dict.catalog.clearAllFilters }),
    ).not.toBeInTheDocument();
  });

  it("offers a primary filter reset that keeps the query when filters emptied the results", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/api/search", () => HttpResponse.json(resultsEnvelope([], 0))),
    );
    currentQuery = "q=zzz&brand=apple&minPrice=9999";

    renderWithProviders(<SearchResultsView query="zzz" page={1} />);

    const reset = await screen.findByRole("button", {
      name: dict.catalog.clearAllFilters,
    });
    expect(reset).toHaveAttribute("data-variant", "default");
    expect(
      screen.queryByRole("link", { name: dict.search.browseAll }),
    ).not.toBeInTheDocument();

    await user.click(reset);

    const params = new URLSearchParams(
      (mockReplace.mock.calls.at(-1)![0] as string).split("?")[1],
    );
    expect(params.get("q")).toBe("zzz");
    expect(params.has("brand")).toBe(false);
    expect(params.has("minPrice")).toBe(false);
  });

  it("shows the error state when the request fails", async () => {
    server.use(
      http.get("*/api/search", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    renderWithProviders(<SearchResultsView query="айфон" page={1} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.search.error,
    );
  });

  // ── TASK-415: the 1 / 2 / 4 card ladder ────────────────────────────────────
  // /search renders the very same ProductCard as /products, so it must settle
  // on the same column count — one card below 390px (two were unreadable on the
  // smallest phones), two from 390px, four from `lg`. The skeleton has to
  // declare the identical columns, or the page reflows the instant real cards
  // replace it. Same pair of guards as in `product-list.test.tsx`.
  describe("results grid (TASK-415)", () => {
    function installOneResult() {
      server.use(
        http.get("*/api/search", () =>
          HttpResponse.json(resultsEnvelope([makeProduct()])),
        ),
      );
    }

    it("renders the grid one-up under 390px, two-up from 390px and four-up from lg", async () => {
      installOneResult();

      renderWithProviders(<SearchResultsView query="айфон" page={1} />);

      const grid = (await screen.findByText("iPhone 15 Case")).closest(".grid");
      expect(grid).not.toBeNull();
      expect(grid).toHaveClass(
        "grid-cols-1",
        "min-[390px]:grid-cols-2",
        "lg:grid-cols-4",
      );
      // Cards in a row share one height whatever their title/badge count.
      expect(grid).toHaveClass("items-stretch");
      // The old sm:2 / md:3 ladder is gone, not merely overridden.
      expect(grid).not.toHaveClass("sm:grid-cols-2");
      expect(grid).not.toHaveClass("md:grid-cols-3");
    });

    it("lays the skeleton out in exactly the same columns as the real grid", async () => {
      installOneResult();

      renderWithProviders(<SearchResultsView query="айфон" page={1} />);
      const realGrid = (await screen.findByText("iPhone 15 Case")).closest(
        ".grid",
      );

      const { container } = renderWithProviders(<SearchResultsSkeleton />);
      const skeletonGrid = container.querySelector(".grid");

      // Both sides must exist — otherwise the comparison below would pass
      // vacuously on two `undefined`s.
      expect(realGrid).not.toBeNull();
      expect(skeletonGrid).toHaveClass(
        "grid-cols-1",
        "min-[390px]:grid-cols-2",
        "lg:grid-cols-4",
      );
      // Byte-identical, not merely "both responsive": any drift here is a
      // visible reflow when the skeleton is replaced by cards.
      expect(skeletonGrid?.className).toBe(realGrid?.className);
    });
  });

  // ── TASK-261: search analytics ─────────────────────────────────────────────
  describe("search analytics", () => {
    afterEach(() => {
      delete window.umami;
    });

    it("reports search with the query term for a non-empty query", async () => {
      const track = jest.fn();
      window.umami = { track };
      server.use(
        http.get("*/api/search", () =>
          HttpResponse.json(resultsEnvelope([makeProduct()])),
        ),
      );

      renderWithProviders(<SearchResultsView query="айфон" page={1} />);
      await screen.findByText("iPhone 15 Case");

      await waitFor(() =>
        expect(track).toHaveBeenCalledWith("search", { query: "айфон" }),
      );
      expect(
        track.mock.calls.filter(([name]) => name === "search"),
      ).toHaveLength(1);
    });

    it("does not report search for a blank query (no search performed)", () => {
      const track = jest.fn();
      window.umami = { track };

      renderWithProviders(<SearchResultsView query="" page={1} />);

      expect(track).not.toHaveBeenCalled();
    });
  });

  // ── TASK-417: the filter sidebar + shared pagination ───────────────────────
  describe("filters and pagination", () => {
    /** Install the results handler and capture the query it was called with. */
    function installSearch(total = 1) {
      const requests: URL[] = [];
      server.use(
        http.get("*/api/search", ({ request }) => {
          requests.push(new URL(request.url));
          return HttpResponse.json(
            resultsEnvelope(total > 0 ? [makeProduct()] : [], total),
          );
        }),
      );
      return requests;
    }

    it("forwards every URL facet to the search request", async () => {
      currentQuery =
        "q=%D0%B0%D0%B9%D1%84%D0%BE%D0%BD&brand=apple&device=iphone-15&inStock=true&minPrice=100&maxPrice=500&sort=price_asc&page=2";
      const requests = installSearch();

      renderWithProviders(<SearchResultsView query="айфон" page={1} />);
      await screen.findByText("iPhone 15 Case");

      const url = requests[0];
      expect(url.searchParams.get("q")).toBe("айфон");
      // TASK-420 — `/search` migrated to slugs together with the catalogue, so
      // the shared filter panel writes one param language on both pages.
      expect(url.searchParams.get("brand")).toBe("apple");
      expect(url.searchParams.get("device")).toBe("iphone-15");
      expect(url.searchParams.get("inStock")).toBe("true");
      expect(url.searchParams.get("minPrice")).toBe("100");
      expect(url.searchParams.get("maxPrice")).toBe("500");
      expect(url.searchParams.get("sort")).toBe("price_asc");
      // The live URL wins over the server-rendered page prop.
      expect(url.searchParams.get("page")).toBe("2");
    });

    it("drops an unknown sort instead of sending it to the API", async () => {
      currentQuery = "q=case&sort=cheapest";
      const requests = installSearch();

      renderWithProviders(<SearchResultsView query="case" page={1} />);
      await screen.findByText("iPhone 15 Case");

      expect(requests[0].searchParams.get("sort")).toBeNull();
    });

    it("renders the shared numbered pagination, preserving the filters in every href", async () => {
      currentQuery = "q=case&brand=apple&page=2";
      installSearch(60);

      renderWithProviders(<SearchResultsView query="case" page={2} />);
      await screen.findByText("iPhone 15 Case");

      const third = await screen.findByRole("link", { name: "3" });
      expect(third).toHaveAttribute("href", expect.stringContaining("page=3"));
      expect(third).toHaveAttribute(
        "href",
        expect.stringContaining("brand=apple"),
      );
      expect(screen.getByRole("link", { name: "2" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    it("writes a filter change to the URL and restarts at page 1", async () => {
      currentQuery = "q=case&page=3";
      installSearch();

      renderWithProviders(<SearchResultsView query="case" page={3} />);
      await screen.findByText("iPhone 15 Case");

      await userEvent.click(
        screen.getAllByLabelText(dict.filters.inStockOnly)[0],
      );

      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      const target = new URL(
        mockReplace.mock.calls[0][0] as string,
        "http://localhost",
      );
      expect(target.searchParams.get("inStock")).toBe("true");
      expect(target.searchParams.get("page")).toBe("1");
      expect(target.searchParams.get("q")).toBe("case");
    });

    it("keeps the query when the panel's «скинути фільтри» clears the filters", async () => {
      // The keyword is the SUBJECT of /search, not one of its filters: a reset
      // must not drop the shopper back onto the blank "start searching" prompt.
      currentQuery = "q=case&brand=apple&inStock=true";
      installSearch();

      renderWithProviders(<SearchResultsView query="case" page={1} />);
      await screen.findByText("iPhone 15 Case");

      // The panel self-corrects a brand slug it cannot offer (BrandFilter, empty
      // list here), so only the write the click itself causes is interesting.
      mockReplace.mockClear();
      await userEvent.click(
        screen.getAllByRole("button", { name: dict.filters.clear })[0],
      );

      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      const target = new URL(
        mockReplace.mock.calls.at(-1)?.[0] as string,
        "http://localhost",
      );
      expect(target.searchParams.get("q")).toBe("case");
      expect(target.searchParams.get("brand")).toBeNull();
      expect(target.searchParams.get("inStock")).toBeNull();
    });

    it("keeps the panel on screen when a filtered search finds nothing", async () => {
      // The one moment the shopper needs the filters most is when they have
      // filtered everything away.
      currentQuery = "q=zzz&inStock=true";
      installSearch(0);

      renderWithProviders(<SearchResultsView query="zzz" page={1} />);

      expect(
        await screen.findByText(dict.search.emptyHeading("zzz")),
      ).toBeInTheDocument();
      expect(
        screen.getAllByLabelText(dict.filters.inStockOnly).length,
      ).toBeGreaterThan(0);
    });

    // TASK-804: the shared drawer — at zero results its footer resets the
    // filters (keeping the query) instead of closing onto an empty grid.
    it("offers a working reset in the drawer when a filtered search finds nothing", async () => {
      currentQuery = "q=zzz&category=cases&brand=apple&inStock=true";
      installSearch(0);

      renderWithProviders(<SearchResultsView query="zzz" page={1} />);
      await screen.findByText(dict.search.emptyHeading("zzz"));

      await userEvent.click(screen.getByRole("button", { name: /^Фільтри/ }));
      const drawer = await screen.findByRole("dialog", {
        name: dict.filters.legend,
      });
      expect(
        within(drawer).getByText(dict.filters.mobileApply(0)),
      ).toBeInTheDocument();

      mockReplace.mockClear();
      // Named apart from the panel's «Скинути фільтри» (which keeps the
      // category chip) — this one clears the lot (TASK-516).
      await userEvent.click(
        within(drawer).getByRole("button", {
          name: dict.catalog.clearAllFilters,
        }),
      );

      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      const target = new URL(
        mockReplace.mock.calls.at(-1)?.[0] as string,
        "http://localhost",
      );
      expect(target.searchParams.get("q")).toBe("zzz");
      expect(target.searchParams.get("category")).toBeNull();
      expect(target.searchParams.get("brand")).toBeNull();
      expect(target.searchParams.get("inStock")).toBeNull();
    });

    /**
     * TASK-523 — the category filter on /search. `GET /api/search` rolls a
     * category up over its subtree; the page now picks one from the catalogue's
     * chips row, and the panel is told its id (brand scope) while keeping the
     * spec facets away (the endpoint has no `?specs=`).
     */
    describe("category (TASK-523)", () => {
      it("writes ?category=<slug> from the chips row and keeps the query", async () => {
        currentQuery = "q=case&page=2";
        installSearch();

        renderWithProviders(<SearchResultsView query="case" page={2} />);
        await screen.findByText("iPhone 15 Case");

        await userEvent.click(
          await screen.findByRole("button", { name: "Зарядні" }),
        );

        await waitFor(() => expect(mockReplace).toHaveBeenCalled());
        const target = new URL(
          mockReplace.mock.calls.at(-1)?.[0] as string,
          "http://localhost",
        );
        expect(target.searchParams.get("category")).toBe("power");
        expect(target.searchParams.get("q")).toBe("case");
        expect(target.searchParams.get("page")).toBe("1");
      });

      it("forwards the URL category to the search request and marks its chip", async () => {
        currentQuery = "q=case&category=cases";
        const requests = installSearch();

        renderWithProviders(<SearchResultsView query="case" page={1} />);
        await screen.findByText("iPhone 15 Case");

        expect(requests[0].searchParams.get("category")).toBe("cases");
        expect(
          await screen.findByRole("button", { name: "Чохли" }),
        ).toHaveAttribute("aria-pressed", "true");
      });

      it("scopes the brand list by the category id but offers no spec facets", async () => {
        currentQuery = "q=case&category=cases";
        installSearch();

        renderWithProviders(<SearchResultsView query="case" page={1} />);
        await screen.findByText("iPhone 15 Case");

        await waitFor(() =>
          expect(
            brandRequests.some(
              (url) => url.searchParams.get("categoryId") === "cat-cases",
            ),
          ).toBe(true),
        );
        expect(facetRequests).toHaveLength(0);
        expect(
          screen.queryByText(dict.filters.specsTitle),
        ).not.toBeInTheDocument();
      });

      it("drops the category with the «Всі категорії» chip", async () => {
        currentQuery = "q=case&category=cases";
        installSearch();

        renderWithProviders(<SearchResultsView query="case" page={1} />);
        await screen.findByText("iPhone 15 Case");

        await userEvent.click(
          await screen.findByRole("button", {
            name: dict.filters.allCategories,
          }),
        );

        await waitFor(() => expect(mockReplace).toHaveBeenCalled());
        const target = new URL(
          mockReplace.mock.calls.at(-1)?.[0] as string,
          "http://localhost",
        );
        expect(target.searchParams.has("category")).toBe(false);
        expect(target.searchParams.get("q")).toBe("case");
      });
    });

    /**
     * TASK-876 — the catalogue's toolbar on /search: the shared «Фільтри»
     * button, the catalogue's sort pill (one `sort` param here) and the row of
     * removable chips for the active filters.
     */
    describe("catalogue toolbar (TASK-876)", () => {
      function installApple() {
        server.use(
          http.get("*/api/brands", () =>
            HttpResponse.json({
              data: [{ id: "brand-apple", name: "Apple", slug: "apple" }],
            }),
          ),
        );
      }

      it("shows a removable chip per active filter, but none for the query", async () => {
        currentQuery = "q=case&brand=apple&inStock=true&minPrice=100";
        installSearch();
        installApple();

        renderWithProviders(<SearchResultsView query="case" page={1} />);
        await screen.findByText("iPhone 15 Case");

        expect(
          await screen.findByRole("button", {
            name: new RegExp(`${dict.filters.brandTitle}: Apple`),
          }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", {
            name: new RegExp(dict.filters.inStockChip),
          }),
        ).toBeInTheDocument();
        // The keyword is the subject of the page (it is in the h1), not a
        // filter — a chip for it would drop the shopper onto the blank prompt.
        expect(
          screen.queryByRole("button", { name: /«case»/ }),
        ).not.toBeInTheDocument();
      });

      it("removes one filter from its chip and keeps the query", async () => {
        currentQuery = "q=case&brand=apple&inStock=true";
        installSearch();
        installApple();

        renderWithProviders(<SearchResultsView query="case" page={1} />);
        await screen.findByText("iPhone 15 Case");
        mockReplace.mockClear();

        await userEvent.click(
          screen.getByRole("button", {
            name: new RegExp(dict.filters.inStockChip),
          }),
        );

        await waitFor(() => expect(mockReplace).toHaveBeenCalled());
        const target = new URL(
          mockReplace.mock.calls.at(-1)?.[0] as string,
          "http://localhost",
        );
        expect(target.searchParams.get("q")).toBe("case");
        expect(target.searchParams.get("brand")).toBe("apple");
        expect(target.searchParams.has("inStock")).toBe(false);
      });

      it("clears every filter with «Очистити все» but keeps the query", async () => {
        currentQuery = "q=case&category=cases&inStock=true&maxPrice=500";
        installSearch();

        renderWithProviders(<SearchResultsView query="case" page={1} />);
        await screen.findByText("iPhone 15 Case");
        mockReplace.mockClear();

        await userEvent.click(
          screen.getByRole("button", { name: dict.filters.clearAll }),
        );

        await waitFor(() => expect(mockReplace).toHaveBeenCalled());
        const target = new URL(
          mockReplace.mock.calls.at(-1)?.[0] as string,
          "http://localhost",
        );
        expect(target.searchParams.get("q")).toBe("case");
        expect(target.searchParams.has("category")).toBe(false);
        expect(target.searchParams.has("inStock")).toBe(false);
        expect(target.searchParams.has("maxPrice")).toBe(false);
      });

      it("renders no chips row when nothing is filtered", async () => {
        currentQuery = "q=case";
        installSearch();

        renderWithProviders(<SearchResultsView query="case" page={1} />);
        await screen.findByText("iPhone 15 Case");

        expect(
          screen.queryByRole("button", { name: dict.filters.clearAll }),
        ).not.toBeInTheDocument();
      });

      it("uses the catalogue's sort pill and writes one `sort` param", async () => {
        currentQuery = "q=case";
        installSearch();
        const user = userEvent.setup();

        renderWithProviders(<SearchResultsView query="case" page={1} />);
        await screen.findByText("iPhone 15 Case");

        const trigger = screen.getByRole("combobox", {
          name: dict.catalog.searchPage.sortAria,
        });
        // The catalogue pill: it shrinks and truncates on a 320px phone.
        expect(trigger).toHaveClass("min-w-0");
        expect(trigger).toHaveTextContent(
          dict.catalog.searchPage.sortRelevance,
        );

        await user.click(trigger);
        await user.click(
          screen.getByRole("option", { name: dict.filters.sort.priceAsc }),
        );

        const target = new URL(
          mockReplace.mock.calls.at(-1)?.[0] as string,
          "http://localhost",
        );
        expect(target.searchParams.get("sort")).toBe("price_asc");
        expect(target.searchParams.has("sortBy")).toBe(false);
        expect(target.searchParams.get("q")).toBe("case");
      });

      it("leaves relevance, the default order, off the URL", async () => {
        currentQuery = "q=case&sort=newest";
        installSearch();
        const user = userEvent.setup();

        renderWithProviders(<SearchResultsView query="case" page={1} />);
        await screen.findByText("iPhone 15 Case");

        await user.click(
          screen.getByRole("combobox", {
            name: dict.catalog.searchPage.sortAria,
          }),
        );
        await user.click(
          screen.getByRole("option", {
            name: dict.catalog.searchPage.sortRelevance,
          }),
        );

        const target = new URL(
          mockReplace.mock.calls.at(-1)?.[0] as string,
          "http://localhost",
        );
        expect(target.searchParams.has("sort")).toBe(false);
      });
    });

    // TASK-742: GET /api/search takes no `onSale`, so the panel must not offer
    // a box that would be ticked with no effect on the results.
    it("does not offer «Зі знижкою» — the search endpoint has no such param", async () => {
      currentQuery = "q=case";
      installSearch();

      renderWithProviders(<SearchResultsView query="case" page={1} />);
      await screen.findByText("iPhone 15 Case");

      expect(
        screen.getAllByLabelText(dict.filters.inStockOnly).length,
      ).toBeGreaterThan(0);
      expect(
        screen.queryByLabelText(dict.filters.onSaleOnly),
      ).not.toBeInTheDocument();
    });

    it("offers no filter panel before anything has been searched for", () => {
      renderWithProviders(<SearchResultsView query="" page={1} />);

      expect(screen.getByText(dict.search.promptHeading)).toBeInTheDocument();
      expect(
        screen.queryByLabelText(dict.filters.inStockOnly),
      ).not.toBeInTheDocument();
    });
  });
});

/**
 * TASK-515 — the results grid dropped twice on every search: by the chips row
 * (60px) when the category tree landed, and by the «Знайдено N» line (44px)
 * when the results replaced a skeleton that had no such line.
 */
describe("SearchResultsView — the page holds its place while loading (TASK-515)", () => {
  const installOneResult = () =>
    server.use(
      http.get("*/api/search", () =>
        HttpResponse.json(resultsEnvelope([makeProduct()])),
      ),
    );
  const holdTheTree = () =>
    server.use(
      http.get("*/api/categories/tree", () => new Promise<never>(() => {})),
    );

  it("reserves the result-count line in the skeleton, gap-6 above the cards", () => {
    renderWithProviders(<SearchResultsSkeleton />);

    const line = screen.getByTestId("result-count-skeleton");
    expect(line).toHaveClass("h-5");
    expect(line.parentElement).toHaveClass("flex", "flex-col", "gap-6");
  });

  it("keeps the chips row's placeholder until the category tree arrives", async () => {
    currentQuery = "q=case";
    installOneResult();
    holdTheTree();

    renderWithProviders(<SearchResultsView query="case" page={1} />);

    await screen.findByText("iPhone 15 Case");
    expect(screen.getByTestId("category-chips-skeleton").children).toHaveLength(
      1,
    );
    expect(
      screen.queryByRole("group", { name: dict.filters.categoryChipsAria }),
    ).not.toBeInTheDocument();
  });

  it("reserves the subcategory row too when a category is selected", async () => {
    currentQuery = "q=case&category=cases";
    installOneResult();
    holdTheTree();

    renderWithProviders(<SearchResultsView query="case" page={1} />);

    await screen.findByText("iPhone 15 Case");
    expect(screen.getByTestId("category-chips-skeleton").children).toHaveLength(
      2,
    );
  });

  it("swaps the placeholder for the chips once the tree is there", async () => {
    currentQuery = "q=case";
    installOneResult();

    renderWithProviders(<SearchResultsView query="case" page={1} />);

    expect(
      await screen.findByRole("group", {
        name: dict.filters.categoryChipsAria,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("category-chips-skeleton"),
    ).not.toBeInTheDocument();
  });
});
