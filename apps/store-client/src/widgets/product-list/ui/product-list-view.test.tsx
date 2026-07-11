import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ProductListView } from "./product-list-view";

// next/navigation is unavailable under jsdom — mock it with a mutable URL so
// each test controls the pathname/query the widget derives its params from.
let currentPathname = "/products";
let currentQuery = "";
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => currentPathname,
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

function makeProduct(id: string, name: string) {
  return {
    id,
    name,
    slug: id,
    description: "A product",
    price: "100.00",
    compareAtPrice: null,
    sku: id.toUpperCase(),
    inStock: true,
    lowStock: false,
    categoryId: "cat-locked",
    groupId: null,
    attributes: {},
    positionOrder: 0,
    isActive: true,
    ratingAverage: 0,
    ratingCount: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    primaryImage: null,
    variantSummary: {
      groupId: null,
      variantCount: 1,
      priceFrom: "100.00",
      defaultVariantId: id,
      defaultVariantSlug: id,
      defaultInStock: true,
      colors: [],
    },
  };
}

function treeNode(id: string, slug: string, name: string) {
  return {
    id,
    name,
    slug,
    isActive: true,
    sortOrder: 0,
    updatedAt: "2026-07-01T00:00:00.000Z",
    children: [],
  };
}

/**
 * Install every handler the catalog view touches; returns the captured
 * /api/products request URLs so tests can assert the effective query params.
 */
function installCatalogHandlers({ empty = false } = {}) {
  const productRequests: URL[] = [];
  server.use(
    http.get("*/api/products", ({ request }) => {
      const url = new URL(request.url);
      productRequests.push(url);
      const data = empty ? [] : [makeProduct("p1", "Alpha Case")];
      return HttpResponse.json({
        data,
        meta: { total: data.length, page: 1, limit: 20, totalPages: 1 },
      });
    }),
    http.get("*/api/categories/tree", () =>
      HttpResponse.json({
        data: [
          treeNode("cat-locked", "cases", "Чохли"),
          treeNode("cat-other", "chargers", "Зарядні"),
        ],
      }),
    ),
    http.get("*/api/brands", () => HttpResponse.json({ data: [] })),
    http.get("*/api/wishlist", () =>
      HttpResponse.json({ data: { items: [] } }),
    ),
    http.get("*/api/device-brands", () => HttpResponse.json({ data: [] })),
    http.get("*/api/device-models", () => HttpResponse.json({ data: [] })),
    http.get("*/api/categories/:id/filterable-specs", () =>
      HttpResponse.json({ data: [] }),
    ),
  );
  return productRequests;
}

beforeEach(() => {
  mockReplace.mockClear();
  currentPathname = "/products";
  currentQuery = "";
});

describe("ProductListView — unlocked (/products, unchanged behavior)", () => {
  it("renders the category chips row and follows ?categoryId= from the URL", async () => {
    const productRequests = installCatalogHandlers();
    currentQuery = "categoryId=cat-other";

    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);

    await screen.findByText("Alpha Case");
    expect(
      screen.getByRole("group", { name: dict.filters.categoryChipsAria }),
    ).toBeInTheDocument();
    expect(productRequests.at(-1)?.searchParams.get("categoryId")).toBe(
      "cat-other",
    );
  });
});

describe("ProductListView — lockedCategoryId (/categories/[slug], TASK-277)", () => {
  it("hides the category chips row and queries the locked category", async () => {
    const productRequests = installCatalogHandlers();
    currentPathname = "/categories/cases";

    renderWithProviders(
      <ProductListView
        initialParams={{ page: 1 }}
        lockedCategoryId="cat-locked"
      />,
    );

    await screen.findByText("Alpha Case");
    expect(
      screen.queryByRole("group", { name: dict.filters.categoryChipsAria }),
    ).not.toBeInTheDocument();
    expect(productRequests.at(-1)?.searchParams.get("categoryId")).toBe(
      "cat-locked",
    );
  });

  it("keeps the locked category when other filters are present — even a stray ?categoryId= never overrides the lock", async () => {
    const productRequests = installCatalogHandlers();
    currentPathname = "/categories/cases";
    currentQuery = "categoryId=cat-other&minPrice=100";

    renderWithProviders(
      <ProductListView
        initialParams={{ page: 1 }}
        lockedCategoryId="cat-locked"
      />,
    );

    await screen.findByText("Alpha Case");
    const lastRequest = productRequests.at(-1)!;
    expect(lastRequest.searchParams.get("categoryId")).toBe("cat-locked");
    expect(lastRequest.searchParams.get("minPrice")).toBe("100");
  });

  it("«Скинути фільтри» clears the other filters but never un-locks the category", async () => {
    const user = userEvent.setup();
    installCatalogHandlers({ empty: true });
    currentPathname = "/categories/cases";
    currentQuery = "minPrice=9999";

    renderWithProviders(
      <ProductListView
        initialParams={{ page: 1 }}
        lockedCategoryId="cat-locked"
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: dict.catalog.clearFilters }),
    );

    expect(mockReplace).toHaveBeenCalled();
    const target = mockReplace.mock.calls.at(-1)![0] as string;
    const [path, query] = target.split("?");
    const params = new URLSearchParams(query);
    // Stays on the landing page, drops the price filter, and — because the
    // category lives in the route, not the URL query — writes no categoryId.
    expect(path).toBe("/categories/cases");
    expect(params.get("minPrice")).toBeNull();
    expect(params.has("categoryId")).toBe(false);
  });
});
