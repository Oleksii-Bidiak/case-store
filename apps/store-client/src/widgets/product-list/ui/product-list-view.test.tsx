import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  within,
} from "@/shared/test/render";
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
  it("renders the category chips row and follows ?category= from the URL", async () => {
    const productRequests = installCatalogHandlers();
    currentQuery = "category=chargers";

    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);

    await screen.findByText("Alpha Case");
    expect(
      screen.getByRole("group", { name: dict.filters.categoryChipsAria }),
    ).toBeInTheDocument();
    // TASK-420: the listing is filtered by the SLUG, and no uuid rides along.
    expect(productRequests.at(-1)?.searchParams.get("category")).toBe(
      "chargers",
    );
    expect(productRequests.at(-1)?.searchParams.has("categoryId")).toBe(false);
  });
});

describe("ProductListView — lockedCategory (/categories/[slug], TASK-277)", () => {
  it("hides the category chips row and queries the locked category", async () => {
    const productRequests = installCatalogHandlers();
    currentPathname = "/categories/cases";

    renderWithProviders(
      <ProductListView
        initialParams={{ page: 1 }}
        lockedCategory={{ id: "cat-locked", slug: "cases" }}
      />,
    );

    await screen.findByText("Alpha Case");
    expect(
      screen.queryByRole("group", { name: dict.filters.categoryChipsAria }),
    ).not.toBeInTheDocument();
    expect(productRequests.at(-1)?.searchParams.get("category")).toBe("cases");
  });

  it("keeps the locked category when other filters are present — even a stray ?category= never overrides the lock", async () => {
    const productRequests = installCatalogHandlers();
    currentPathname = "/categories/cases";
    currentQuery = "category=chargers&minPrice=100";

    renderWithProviders(
      <ProductListView
        initialParams={{ page: 1 }}
        lockedCategory={{ id: "cat-locked", slug: "cases" }}
      />,
    );

    await screen.findByText("Alpha Case");
    const lastRequest = productRequests.at(-1)!;
    expect(lastRequest.searchParams.get("category")).toBe("cases");
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
        lockedCategory={{ id: "cat-locked", slug: "cases" }}
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
    // category lives in the route, not the URL query — writes no category param.
    expect(path).toBe("/categories/cases");
    expect(params.get("minPrice")).toBeNull();
    expect(params.has("category")).toBe(false);
  });
});

/**
 * TASK-414 — the catalogue filters: one reset set, the availability param, and
 * the per-category brand query.
 */
describe("ProductListView — filters (TASK-414)", () => {
  it("forwards ?inStock=true to the product query", async () => {
    const productRequests = installCatalogHandlers();
    currentQuery = "inStock=true";

    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);

    await screen.findByText("Alpha Case");
    expect(productRequests.at(-1)?.searchParams.get("inStock")).toBe("true");
  });

  // Only the literal "true" turns it on — the same rule the API's boolean
  // transform applies, so `?inStock=false` must not filter anything.
  it("ignores ?inStock=false rather than treating it as a filter", async () => {
    const productRequests = installCatalogHandlers();
    currentQuery = "inStock=false";

    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);

    await screen.findByText("Alpha Case");
    expect(productRequests.at(-1)?.searchParams.has("inStock")).toBe(false);
  });

  // The regression that motivated the shared filter set: «Скинути фільтри»
  // cleared four params and left the device, spec and availability selections
  // applied — visible in the chips row, unreachable from the reset.
  it("«Скинути фільтри» clears EVERY filter, not just the four it used to", async () => {
    const user = userEvent.setup();
    installCatalogHandlers({ empty: true });
    currentQuery =
      "search=чохол&category=chargers&brand=apple&device=iphone-15" +
      "&minPrice=100&maxPrice=900&specs=material%3AСилікон&inStock=true";

    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);
    await screen.findByText(dict.catalog.emptyHeading);

    // The sidebar panel carries a reset button with the SAME label, and it
    // deliberately leaves the category alone (its control is the chips row).
    // The one under test is the empty state's, which clears the lot — so pick
    // it by its container rather than by a label the two share.
    const emptyState = screen
      .getByText(dict.catalog.emptyHeading)
      .closest("div")!;
    await user.click(
      within(emptyState).getByRole("button", {
        name: dict.catalog.clearFilters,
      }),
    );

    const target = mockReplace.mock.calls.at(-1)![0] as string;
    const params = new URLSearchParams(target.split("?")[1]);
    for (const key of [
      "search",
      "category",
      "brand",
      "device",
      "minPrice",
      "maxPrice",
      "specs",
      "inStock",
    ]) {
      expect(params.has(key)).toBe(false);
    }
  });

  it("badges the mobile filters button with the spec facets the old count missed", async () => {
    installCatalogHandlers();
    currentQuery = "specs=material%3AСилікон%2CTPU&inStock=true";

    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);

    await screen.findByText("Alpha Case");
    // specs (1) + inStock (1) — the category is excluded (its control is the
    // chips row), and both of these were previously uncounted. The badge is
    // inside the button, so its accessible name is "Фільтри 2".
    expect(screen.getByRole("button", { name: /^Фільтри/ })).toHaveTextContent(
      "2",
    );
  });

  // TASK-420: the URL names the category by SLUG, but `GET /brands` is still
  // id-addressed — the widget resolves the one from the other through the
  // category tree it already holds, so the scoping survives the migration.
  it("scopes the brand query to the active category, resolving its id from the slug", async () => {
    const brandRequests: URL[] = [];
    installCatalogHandlers();
    server.use(
      http.get("*/api/brands", ({ request }) => {
        brandRequests.push(new URL(request.url));
        return HttpResponse.json({ data: [] });
      }),
    );
    currentQuery = "category=chargers";

    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);

    await screen.findByText("Alpha Case");
    expect(brandRequests.at(-1)?.searchParams.get("categoryId")).toBe(
      "cat-other",
    );
  });

  // A sticky aside with no height cap runs off the bottom of a short viewport
  // and, being sticky, the page scroll never brings the overflow back.
  it("gives the desktop sidebar its own scroll box", async () => {
    const { container } = renderWithProviders(
      <ProductListView initialParams={{ page: 1 }} />,
    );
    installCatalogHandlers();

    const aside = container.querySelector("aside")!;
    expect(aside.className).toContain("lg:max-h-[calc(100dvh-7rem)]");
    expect(aside.className).toContain("lg:overflow-y-auto");
    expect(aside.className).toContain("lg:overscroll-contain");
  });
});

describe("ProductListView — mobile filter drawer count (TASK-084)", () => {
  it("shows the live, grammatically-correct result count on the apply button", async () => {
    installCatalogHandlers(); // one matching product
    const user = userEvent.setup();

    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);
    await screen.findByText("Alpha Case");

    await user.click(
      screen.getByRole("button", { name: dict.filters.filtersButton }),
    );

    // Count reads the same (already warm) query the grid used — no empty state.
    const applyButton = await screen.findByRole("button", {
      name: dict.filters.mobileApply(1),
    });
    expect(applyButton).toBeEnabled();
    expect(applyButton).toHaveTextContent("Показати 1 товар");
  });

  it("disables the apply button with the empty-state label when nothing matches", async () => {
    installCatalogHandlers({ empty: true });
    const user = userEvent.setup();

    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);
    await screen.findByText(dict.catalog.emptyHeading);

    await user.click(
      screen.getByRole("button", { name: dict.filters.filtersButton }),
    );

    const applyButton = await screen.findByRole("button", {
      name: dict.filters.mobileApply(0),
    });
    expect(applyButton).toBeDisabled();
    expect(applyButton).toHaveTextContent("Немає товарів за цими фільтрами");
  });
});
