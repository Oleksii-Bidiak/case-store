import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { SearchResultsView } from "./search-results-view";

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
});
