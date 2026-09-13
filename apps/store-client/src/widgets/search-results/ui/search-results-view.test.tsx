import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
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

/**
 * The sidebar panel (TASK-417) fetches its own option lists. They are empty
 * here — this suite is about the results column and the URL contract, not about
 * the panel's internals, which `product-filters.test.tsx` owns.
 */
function installFilterPanelHandlers() {
  server.use(
    http.get("*/api/brands", () => HttpResponse.json({ data: [] })),
    http.get("*/api/device-brands", () => HttpResponse.json({ data: [] })),
    http.get("*/api/device-models", () => HttpResponse.json({ data: [] })),
    http.get("*/api/wishlist", () =>
      HttpResponse.json({ data: { items: [] } }),
    ),
  );
}

beforeEach(() => {
  currentQuery = "";
  mockReplace.mockClear();
  installFilterPanelHandlers();
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
    expect(
      screen.getByRole("link", { name: dict.search.browseAll }),
    ).toBeInTheDocument();
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
        "q=%D0%B0%D0%B9%D1%84%D0%BE%D0%BD&brandId=brand-1&deviceModelId=dm-1&inStock=true&minPrice=100&maxPrice=500&sort=price_asc&page=2";
      const requests = installSearch();

      renderWithProviders(<SearchResultsView query="айфон" page={1} />);
      await screen.findByText("iPhone 15 Case");

      const url = requests[0];
      expect(url.searchParams.get("q")).toBe("айфон");
      expect(url.searchParams.get("brandId")).toBe("brand-1");
      expect(url.searchParams.get("deviceModelId")).toBe("dm-1");
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
      currentQuery = "q=case&brandId=brand-1&page=2";
      installSearch(60);

      renderWithProviders(<SearchResultsView query="case" page={2} />);
      await screen.findByText("iPhone 15 Case");

      const third = await screen.findByRole("link", { name: "3" });
      expect(third).toHaveAttribute("href", expect.stringContaining("page=3"));
      expect(third).toHaveAttribute(
        "href",
        expect.stringContaining("brandId=brand-1"),
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
      currentQuery = "q=case&brandId=brand-1&inStock=true";
      installSearch();

      renderWithProviders(<SearchResultsView query="case" page={1} />);
      await screen.findByText("iPhone 15 Case");

      // The panel self-corrects a brand id it cannot offer (BrandFilter, empty
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
      expect(target.searchParams.get("brandId")).toBeNull();
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

    it("offers no filter panel before anything has been searched for", () => {
      renderWithProviders(<SearchResultsView query="" page={1} />);

      expect(screen.getByText(dict.search.promptHeading)).toBeInTheDocument();
      expect(
        screen.queryByLabelText(dict.filters.inStockOnly),
      ).not.toBeInTheDocument();
    });
  });
});
