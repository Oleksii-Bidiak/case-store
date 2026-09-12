import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { SearchResultsView } from "./search-results-view";
import { SearchResultsSkeleton } from "./search-results-skeleton";

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
});
