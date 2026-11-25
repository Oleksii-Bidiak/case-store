import { http, HttpResponse } from "msw";
import {
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  dehydrate,
} from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { getCategoryControllerGetCategoryTreeQueryKey } from "@/entities/category";
import { getProductControllerFindAllQueryKey } from "@/entities/product";
import { AuthContext } from "@/entities/session/model/auth.context";
import { addDevice, clearMyDevices } from "@/entities/my-devices";
import { PrefetchBoundary } from "@/shared/api/prefetch-boundary";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import {
  buildCatalogListingParams,
  readSearchParamsRecord,
} from "../model/listing-params";
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
      // The listing's own requests only: the count line's unfiltered total
      // (Catalog §3) is a `limit: 1` read beside them.
      if (url.searchParams.get("limit") !== "1") productRequests.push(url);
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
  it("renders the category tree and follows ?category= from the URL", async () => {
    const productRequests = installCatalogHandlers();
    currentQuery = "category=chargers&view=list&brand=apple";

    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);

    await screen.findByText("Alpha Case");
    const tree = await screen.findByRole("navigation", {
      name: dict.filters.categoryTreeTitle,
    });
    // TASK-2011: the URL's category is the tree's current node, and every
    // node links to its own landing page, keeping the view but not the facets.
    expect(within(tree).getByRole("link", { name: "Зарядні" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(tree).getByRole("link", { name: "Чохли" })).toHaveAttribute(
      "href",
      "/categories/cases?view=list",
    );
    expect(
      within(tree).getByRole("link", { name: dict.filters.allCategories }),
    ).toHaveAttribute("href", "/products?view=list");
    // TASK-420: the listing is filtered by the SLUG, and no uuid rides along.
    expect(productRequests.at(-1)?.searchParams.get("category")).toBe(
      "chargers",
    );
    expect(productRequests.at(-1)?.searchParams.has("categoryId")).toBe(false);
  });
});

describe("ProductListView — lockedCategory (/categories/[slug], TASK-277)", () => {
  it("marks the locked category current in the tree and queries it", async () => {
    const productRequests = installCatalogHandlers();
    currentPathname = "/categories/cases";

    renderWithProviders(
      <ProductListView
        initialParams={{ page: 1 }}
        lockedCategory={{ id: "cat-locked", slug: "cases" }}
      />,
    );

    await screen.findByText("Alpha Case");
    const tree = await screen.findByRole("navigation", {
      name: dict.filters.categoryTreeTitle,
    });
    expect(within(tree).getByRole("link", { name: "Чохли" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(tree).getByRole("link", { name: "Зарядні" })).toHaveAttribute(
      "href",
      "/categories/chargers",
    );
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

  it("«Скинути всі фільтри» clears the other filters but never un-locks the category", async () => {
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
      await screen.findByRole("button", { name: dict.catalog.clearAllFilters }),
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
 * TASK-1301 — `/promo` «Товари зі знижкою» is this listing with the discount
 * as a route lock: the full catalogue toolbar, minus the «Зі знижкою» control.
 */
describe("ProductListView — lockedOnSale (/promo, TASK-1301)", () => {
  it("queries on-sale positions only, whatever the URL says", async () => {
    const productRequests = installCatalogHandlers();
    currentPathname = "/promo";
    currentQuery = "onSale=false&category=cases";

    renderWithProviders(<ProductListView lockedOnSale />);

    await screen.findByText("Alpha Case");
    const lastRequest = productRequests.at(-1)!;
    expect(lastRequest.searchParams.get("onSale")).toBe("true");
    expect(lastRequest.searchParams.get("category")).toBe("cases");
  });

  it("keeps the category tree, but neither the discount control nor its chip", async () => {
    installCatalogHandlers();
    currentPathname = "/promo";
    currentQuery = "inStock=true";

    renderWithProviders(<ProductListView lockedOnSale anchorId="deals" />);
    await screen.findByText("Alpha Case");

    // TASK-2011: the deals have no per-category landing, so the tree narrows
    // them by ?category= on /promo itself and lands back on the listing.
    const tree = await screen.findByRole("navigation", {
      name: dict.filters.categoryTreeTitle,
    });
    expect(within(tree).getByRole("link", { name: "Зарядні" })).toHaveAttribute(
      "href",
      "/promo?category=chargers#deals",
    );
    expect(
      screen.queryByRole("checkbox", { name: dict.filters.onSaleOnly }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: new RegExp(`^${dict.filters.onSaleChip}`),
      }),
    ).not.toBeInTheDocument();
    // The availability chip stays: only the locked axis disappears.
    expect(
      screen.getByRole("button", {
        name: new RegExp(`^${dict.filters.inStockChip}`),
      }),
    ).toBeInTheDocument();
  });

  it("badges the filters button without the locked discount", async () => {
    installCatalogHandlers();
    currentPathname = "/promo";
    currentQuery = "brand=apple";

    renderWithProviders(<ProductListView lockedOnSale />);
    await screen.findByText("Alpha Case");

    const button = screen.getByRole("button", {
      name: new RegExp(dict.filters.filtersButton),
    });
    expect(within(button).getByText("1")).toBeInTheDocument();
  });

  it("stays on /promo and keeps the lock when every filter is reset", async () => {
    const user = userEvent.setup();
    const productRequests = installCatalogHandlers({ empty: true });
    currentPathname = "/promo";
    currentQuery = "minPrice=9999";

    renderWithProviders(<ProductListView lockedOnSale />);

    await user.click(
      await screen.findByRole("button", { name: dict.catalog.clearAllFilters }),
    );

    const target = mockReplace.mock.calls.at(-1)![0] as string;
    const [path, query] = target.split("?");
    expect(path).toBe("/promo");
    expect(new URLSearchParams(query).has("minPrice")).toBe(false);
    expect(productRequests.at(-1)?.searchParams.get("onSale")).toBe("true");
  });

  // TASK-2414: a filter change replaces the URL without scrolling and without
  // the anchor (TASK-1301's old workaround for the jump to the top) — the
  // shopper stays where they are, on the deals.
  it("writes filter changes without the anchor and without scrolling", async () => {
    const user = userEvent.setup();
    installCatalogHandlers({ empty: true });
    currentPathname = "/promo";
    currentQuery = "minPrice=9999";

    renderWithProviders(<ProductListView lockedOnSale anchorId="deals" />);

    await user.click(
      await screen.findByRole("button", { name: dict.catalog.clearAllFilters }),
    );

    const [target, options] = mockReplace.mock.calls.at(-1)!;
    expect(target).toMatch(/^\/promo\?[^#]*$/);
    expect(options).toEqual({ scroll: false });
  });

  // A page change is a deliberate jump to the listing: the page links keep it.
  it("points the page links back at its anchor", async () => {
    installCatalogHandlers();
    server.use(
      http.get("*/api/products", () =>
        HttpResponse.json({
          data: [makeProduct("p1", "Alpha Case")],
          meta: { total: 60, page: 1, limit: 20, totalPages: 3 },
        }),
      ),
    );
    currentPathname = "/promo";

    renderWithProviders(<ProductListView lockedOnSale anchorId="deals" />);

    await screen.findByText("Alpha Case");
    const pageTwo = await waitFor(() => {
      const link = screen
        .getAllByRole("link")
        .find((node) =>
          /[?&]page=2(&|#|$)/.test(node.getAttribute("href") ?? ""),
        );
      expect(link).toBeDefined();
      return link!;
    });
    expect(pageTwo.getAttribute("href")).toMatch(/#deals$/);
  });
});

/** TASK-2414 — filter, sort and view changes never scroll the page. */
describe("ProductListView — scroll position (TASK-2414)", () => {
  it("replaces the URL with scroll: false on a view change", async () => {
    const user = userEvent.setup();
    installCatalogHandlers();
    currentQuery = "";

    renderWithProviders(<ProductListView />);
    await screen.findByText("Alpha Case");

    await user.click(
      screen.getByRole("button", { name: dict.filters.viewListAria }),
    );

    const [target, options] = mockReplace.mock.calls.at(-1)!;
    expect(target).toContain("view=list");
    expect(target).not.toContain("#");
    expect(options).toEqual({ scroll: false });
  });

  it("replaces the URL with scroll: false on a rail filter change", async () => {
    const user = userEvent.setup();
    installCatalogHandlers();
    currentQuery = "";

    const { container } = renderWithProviders(<ProductListView />);
    await screen.findByText("Alpha Case");

    const rail = container.querySelector("aside")!;
    await user.click(
      within(rail as HTMLElement).getByRole("checkbox", {
        name: dict.filters.inStockOnly,
      }),
    );

    const [target, options] = mockReplace.mock.calls.at(-1)!;
    expect(target).toContain("inStock=true");
    expect(target).not.toContain("#");
    expect(options).toEqual({ scroll: false });
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

  // TASK-742 — «Зі знижкою» reaches the query with the same literal-"true" rule.
  it("forwards ?onSale=true to the product query and ignores ?onSale=false", async () => {
    const productRequests = installCatalogHandlers();
    currentQuery = "onSale=true";

    const { unmount } = renderWithProviders(
      <ProductListView initialParams={{ page: 1 }} />,
    );
    await screen.findByText("Alpha Case");
    expect(productRequests.at(-1)?.searchParams.get("onSale")).toBe("true");
    unmount();

    currentQuery = "onSale=false";
    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);
    await screen.findByText("Alpha Case");
    expect(productRequests.at(-1)?.searchParams.has("onSale")).toBe(false);
  });

  it("offers the «Зі знижкою» control and its chip on the catalogue", async () => {
    installCatalogHandlers();
    currentQuery = "onSale=true";

    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);
    await screen.findByText("Alpha Case");

    expect(
      screen.getByRole("checkbox", { name: dict.filters.onSaleOnly }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", {
        name: new RegExp(`^${dict.filters.onSaleChip}`),
      }),
    ).toBeInTheDocument();
  });

  // The regression that motivated the shared filter set: «Скинути фільтри»
  // cleared four params and left the device, spec and availability selections
  // applied — visible in the chips row, unreachable from the reset.
  it("«Скинути всі фільтри» clears EVERY filter, not just the four it used to", async () => {
    const user = userEvent.setup();
    installCatalogHandlers({ empty: true });
    currentQuery =
      "search=чохол&category=chargers&brand=apple&device=iphone-15" +
      "&minPrice=100&maxPrice=900&specs=material%3AСилікон&inStock=true";

    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);
    await screen.findByText(dict.catalog.emptyHeading);

    // The empty state's reset clears the lot, category included; since
    // TASK-516 it is NAMED differently from the panel's, which keeps the
    // category — so it is found by its own name, no container scoping needed.
    await user.click(
      screen.getByRole("button", { name: dict.catalog.clearAllFilters }),
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

  // TASK-516: two buttons that do different things (the panel keeps the
  // category, the empty state does not) must not share an accessible name.
  it("names the empty state's reset apart from the panel's", async () => {
    installCatalogHandlers({ empty: true });
    currentQuery = "category=chargers&minPrice=100";

    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);
    await screen.findByText(dict.catalog.emptyHeading);

    expect(dict.catalog.clearAllFilters).not.toBe(dict.filters.clear);
    expect(
      screen.getAllByRole("button", { name: dict.catalog.clearAllFilters }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: dict.filters.clear }),
    ).toHaveLength(1);
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

  // With the category tree on top, a capped sticky rail that scrolls inside
  // itself hid every filter below its own fold (Д3 review) — the rail grows
  // with the page instead, so page scroll reaches all of it.
  it("lets the desktop rail grow with the page, not scroll inside itself", async () => {
    const { container } = renderWithProviders(
      <ProductListView initialParams={{ page: 1 }} />,
    );
    installCatalogHandlers();

    const aside = container.querySelector("aside")!;
    expect(aside.className).not.toContain("lg:sticky");
    expect(aside.className).not.toContain("lg:max-h-sticky-aside");
    expect(aside.className).not.toContain("lg:overflow-y-auto");
  });
});

/**
 * TASK-1958 — the grid / list toggle used to be `hidden lg:flex`, so phones and
 * tablets had no list view at all. It now sits in the toolbar at every width
 * and keeps the choice in the URL (`?view=list`, grid = no param).
 */
describe("ProductListView — view toggle at every width (TASK-1958)", () => {
  it("renders the toggle with no responsive hiding on it or its toolbar group", async () => {
    installCatalogHandlers();
    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);
    await screen.findByText("Alpha Case");

    const toggle = screen.getByRole("button", {
      name: dict.filters.viewListAria,
    });
    expect(toggle.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(toggle.parentElement?.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it("writes ?view=list and keeps the other params", async () => {
    const user = userEvent.setup();
    installCatalogHandlers();
    currentQuery = "category=chargers&page=2";
    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);
    await screen.findByText("Alpha Case");

    await user.click(
      screen.getByRole("button", { name: dict.filters.viewListAria }),
    );

    const target = mockReplace.mock.calls.at(-1)![0] as string;
    const params = new URLSearchParams(target.split("?")[1]);
    expect(params.get("view")).toBe("list");
    expect(params.get("category")).toBe("chargers");
    expect(params.get("page")).toBe("2");
  });

  it("offers the grid back once the list is shown", async () => {
    const user = userEvent.setup();
    installCatalogHandlers();
    currentQuery = "view=list";
    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);
    await screen.findByText("Alpha Case");

    await user.click(
      screen.getByRole("button", { name: dict.filters.viewGridAria }),
    );

    const target = mockReplace.mock.calls.at(-1)![0] as string;
    expect(new URLSearchParams(target.split("?")[1] ?? "").has("view")).toBe(
      false,
    );
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

  // TASK-804: the drawer used to DISABLE its only labelled action here, and
  // the working reset lay under the drawer, on the page behind it.
  it("offers the empty state's working reset in the drawer when nothing matches", async () => {
    installCatalogHandlers({ empty: true });
    const user = userEvent.setup();
    currentQuery = "category=chargers&minPrice=9999&inStock=true";

    renderWithProviders(<ProductListView initialParams={{ page: 1 }} />);
    await screen.findByText(dict.catalog.emptyHeading);

    await user.click(screen.getByRole("button", { name: /^Фільтри/ }));

    const drawer = await screen.findByRole("dialog", {
      name: dict.filters.legend,
    });
    expect(
      within(drawer).getByText(dict.filters.mobileApply(0)),
    ).toBeInTheDocument();
    const reset = within(drawer).getByRole("button", {
      name: dict.catalog.clearAllFilters,
    });
    expect(reset).toBeEnabled();

    await user.click(reset);

    const target = mockReplace.mock.calls.at(-1)![0] as string;
    const params = new URLSearchParams(target.split("?")[1]);
    expect(params.has("category")).toBe(false);
    expect(params.has("minPrice")).toBe(false);
    expect(params.has("inStock")).toBe(false);
  });

  it("keeps a route-locked device when the drawer resets (TASK-804 × TASK-490)", async () => {
    installCatalogHandlers({ empty: true });
    const user = userEvent.setup();
    currentPathname = "/catalog/chohly/iphone-15";
    currentQuery = "minPrice=9999";

    renderWithProviders(
      <ProductListView
        initialParams={{ page: 1 }}
        lockedCategory={{ id: "cat-locked", slug: "chohly" }}
        lockedDevice={{ slug: "iphone-15" }}
      />,
    );
    await screen.findByText(dict.catalog.emptyHeading);

    await user.click(screen.getByRole("button", { name: /^Фільтри/ }));
    const drawer = await screen.findByRole("dialog", {
      name: dict.filters.legend,
    });
    await user.click(
      within(drawer).getByRole("button", {
        name: dict.catalog.clearAllFilters,
      }),
    );

    const target = mockReplace.mock.calls.at(-1)![0] as string;
    const [path, query] = target.split("?");
    expect(path).toBe("/catalog/chohly/iphone-15");
    expect(new URLSearchParams(query).has("minPrice")).toBe(false);
  });
});

describe("ProductListView — adopts the server's prefetch (TASK-563)", () => {
  /** A client configured like the app's (`app/providers.tsx`: 5-minute staleTime). */
  const appLikeClient = () =>
    new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
    });

  /**
   * What the server page does for one URL: build the params from the awaited
   * `searchParams` record, fill a query client, dehydrate it.
   */
  function serverState(
    record: Record<string, string>,
    locks?: Parameters<typeof buildCatalogListingParams>[1],
  ) {
    const server = new QueryClient();
    server.setQueryData(
      getProductControllerFindAllQueryKey(
        buildCatalogListingParams(readSearchParamsRecord(record), locks),
      ),
      {
        data: [makeProduct("p-ssr", "Server Case")],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    );
    return dehydrate(server);
  }

  it("renders the prefetched cards on the first render and does not fetch them again", async () => {
    const productRequests = installCatalogHandlers();
    // The rules the builder owns: trimmed search, literal-"true" facet, a
    // blank `specs` read as absent — each one a key mismatch if either side
    // spelled it differently.
    currentQuery = "search=%20case%20&inStock=true&specs=&page=1";

    renderWithProviders(
      <HydrationBoundary
        state={serverState({
          search: " case ",
          inStock: "true",
          specs: "",
          page: "1",
        })}
      >
        <ProductListView />
      </HydrationBoundary>,
      { queryClient: appLikeClient() },
    );

    // Synchronously — no skeleton first, i.e. what hydration will see.
    expect(screen.getByText("Server Case")).toBeInTheDocument();
    await screen.findAllByText(dict.catalog.countProducts(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The listing itself is not refetched. (The count line's «з N товарів»
    // reads the unfiltered total with a `limit: 1` request of its own.)
    expect(
      productRequests.filter((url) => url.searchParams.get("limit") !== "1"),
    ).toHaveLength(0);
  });

  it("does the same on a category landing page, where the segment is the category", async () => {
    const productRequests = installCatalogHandlers();
    currentPathname = "/categories/cases";
    currentQuery = "category=ignored";

    renderWithProviders(
      <HydrationBoundary
        state={serverState({ category: "ignored" }, { categorySlug: "cases" })}
      >
        <ProductListView lockedCategory={{ id: "cat-locked", slug: "cases" }} />
      </HydrationBoundary>,
      { queryClient: appLikeClient() },
    );

    expect(screen.getByText("Server Case")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(productRequests).toHaveLength(0);
  });
});

/**
 * TASK-515 / TASK-2011 — the category tree tops the rail. It is in the first
 * HTML (as crawlable links) when the route prefetched the tree, and a
 * same-size placeholder stands in whenever there is no tree yet, so the filter
 * cards under it do not move when it lands.
 */
describe("ProductListView — the category tree holds its place (TASK-515, TASK-2011)", () => {
  const tree = {
    data: [
      treeNode("cat-locked", "cases", "Чохли"),
      treeNode("cat-other", "chargers", "Зарядні"),
    ],
  };

  const serverHtml = (ui: React.ReactElement) =>
    renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <AuthContext.Provider
          value={{
            accessToken: null,
            userId: null,
            role: null,
            isAuthenticated: false,
            isInitializing: false,
            setTokens: jest.fn(),
            clearTokens: jest.fn(),
          }}
        >
          {ui}
        </AuthContext.Provider>
      </QueryClientProvider>,
    );

  it("puts the tree's links into the server HTML when the route prefetched the tree", () => {
    const prefetched = new QueryClient();
    prefetched.setQueryData(
      getCategoryControllerGetCategoryTreeQueryKey(),
      tree,
    );

    const html = serverHtml(
      <PrefetchBoundary state={dehydrate(prefetched)}>
        <ProductListView categoryTreePrefetched />
      </PrefetchBoundary>,
    );

    expect(html).toContain('href="/categories/chargers"');
    expect(html).toContain("Зарядні");
    expect(html).not.toContain('data-testid="category-tree-skeleton"');
  });

  it("reserves the panel with its placeholder when the server had no tree", () => {
    const html = serverHtml(<ProductListView />);

    expect(html).toContain('data-testid="category-tree-skeleton"');
    expect(html).not.toContain('href="/categories/chargers"');
  });

  it("keeps the placeholder on the client until the tree arrives", async () => {
    installCatalogHandlers();
    server.use(
      http.get("*/api/categories/tree", () => new Promise<never>(() => {})),
    );

    renderWithProviders(<ProductListView />);

    await screen.findByText("Alpha Case");
    expect(screen.getByTestId("category-tree-skeleton")).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", {
        name: dict.filters.categoryTreeTitle,
      }),
    ).not.toBeInTheDocument();
    // The sheet's button keeps its place, neutral and inert, meanwhile.
    expect(
      screen.getByRole("button", { name: dict.filters.categoryTreeTitle }),
    ).toBeDisabled();
  });

  it("swaps the placeholder for the tree once it is there", async () => {
    installCatalogHandlers();

    renderWithProviders(<ProductListView />);

    expect(
      await screen.findByRole("navigation", {
        name: dict.filters.categoryTreeTitle,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("category-tree-skeleton"),
    ).not.toBeInTheDocument();
    // Below lg: «Підкатегорії · 2» — the two roots on «Усі товари».
    expect(
      screen.getByRole("button", { name: dict.filters.subcategoriesButton(2) }),
    ).toBeEnabled();
  });

  it("draws no tree on a compat page, where the route fixes the device", async () => {
    installCatalogHandlers();
    currentPathname = "/catalog/cases/iphone-15";

    renderWithProviders(
      <ProductListView
        lockedCategory={{ id: "cat-locked", slug: "cases" }}
        lockedDevice={{ slug: "iphone-15" }}
      />,
    );

    await screen.findByText("Alpha Case");
    expect(
      screen.queryByTestId("category-tree-skeleton"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", {
        name: dict.filters.categoryTreeTitle,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Підкатегорії|^Категорія$/ }),
    ).not.toBeInTheDocument();
  });
});

// design-system §6 (TASK-870): icon + one line + ONE primary action, and the
// action is a reset only when a reset would change something.
describe("ProductListView — empty state (TASK-870)", () => {
  it("makes the filter reset the primary action when filters emptied the list", async () => {
    installCatalogHandlers({ empty: true });
    currentQuery = "minPrice=9999";

    renderWithProviders(<ProductListView />);
    await screen.findByText(dict.catalog.emptyHeading);

    expect(
      screen.getByRole("button", { name: dict.catalog.clearAllFilters }),
    ).toHaveAttribute("data-variant", "default");
  });

  it("leads home from an empty, unfiltered /products instead of a no-op reset", async () => {
    installCatalogHandlers({ empty: true });

    renderWithProviders(<ProductListView />);
    await screen.findByText(dict.catalog.emptyUnfilteredBody);

    expect(
      screen.queryByRole("button", { name: dict.catalog.clearAllFilters }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.common.goHome }),
    ).toHaveAttribute("href", "/");
  });

  it("leads to the catalogue from an empty category landing page", async () => {
    installCatalogHandlers({ empty: true });
    currentPathname = "/categories/cases";

    renderWithProviders(
      <ProductListView lockedCategory={{ id: "cat-locked", slug: "cases" }} />,
    );
    await screen.findByText(dict.catalog.emptyHeading);

    expect(
      screen.getByRole("link", { name: dict.catalog.emptyBrowseAll }),
    ).toHaveAttribute("href", "/products");
  });

  it("says nothing is on sale on an unfiltered /promo and leads to the catalogue", async () => {
    installCatalogHandlers({ empty: true });
    currentPathname = "/promo";

    renderWithProviders(<ProductListView lockedOnSale />);
    await screen.findByText(dict.promo.dealsEmptyHeading);

    expect(
      screen.queryByRole("button", { name: dict.catalog.clearAllFilters }),
    ).not.toBeInTheDocument();
    const cta = screen.getByRole("link", { name: dict.promo.dealsEmptyCta });
    expect(cta).toHaveAttribute("href", "/products");
    expect(cta).toHaveAttribute("data-variant", "default");
  });
});

describe("ProductListView — the «Мої пристрої» default (TASK-2076)", () => {
  const pro = {
    modelId: "m-15p",
    slug: "iphone-15-pro",
    name: "iPhone 15 Pro",
    brandName: "Apple",
    family: "iphone" as const,
  };

  beforeEach(() => {
    window.localStorage.clear();
    clearMyDevices();
  });

  it("lists by the active device when the URL names none", async () => {
    const productRequests = installCatalogHandlers();
    addDevice(pro);

    renderWithProviders(
      <ProductListView myDevicesDefault={{ on: true, scope: "active" }} />,
    );

    await screen.findByText("Alpha Case");
    expect(
      productRequests.some(
        (url) => url.searchParams.get("device") === "iphone-15-pro",
      ),
    ).toBe(true);
  });

  it("applies no default after compat=off or without the opt-in", async () => {
    const productRequests = installCatalogHandlers();
    addDevice(pro);
    currentQuery = "compat=off";

    const { unmount } = renderWithProviders(
      <ProductListView myDevicesDefault={{ on: true, scope: "active" }} />,
    );
    await screen.findByText("Alpha Case");
    unmount();
    currentQuery = "";
    renderWithProviders(<ProductListView />);
    await screen.findByText("Alpha Case");

    expect(
      productRequests.every((url) => !url.searchParams.has("device")),
    ).toBe(true);
  });
});

describe("ProductListView — no unfiltered first paint (TASK-2421)", () => {
  const pro = {
    modelId: "m-15p",
    slug: "iphone-15-pro",
    name: "iPhone 15 Pro",
    brandName: "Apple",
    family: "iphone" as const,
  };
  const ON = { on: true, scope: "active" } as const;

  const serverHtml = (ui: React.ReactElement) => {
    const doc = document.createElement("div");
    // innerHTML never runs scripts — the markup is only inspected.
    doc.innerHTML = renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <AuthContext.Provider
          value={{
            accessToken: null,
            userId: null,
            role: null,
            isAuthenticated: false,
            isInitializing: false,
            setTokens: jest.fn(),
            clearTokens: jest.fn(),
          }}
        >
          {ui}
        </AuthContext.Provider>
      </QueryClientProvider>,
    );
    return doc;
  };
  const results = (doc: ParentNode) =>
    doc.querySelector('[data-testid="product-list-results"]');
  const skeleton = (doc: ParentNode) =>
    doc.querySelector('[data-testid="default-filter-skeleton"]');

  beforeEach(() => {
    window.localStorage.clear();
    clearMyDevices();
  });

  it("server HTML: keys the grid, the counts and a skeleton to html[data-device-filter]", () => {
    // A saved device must not change the server markup (SF-CAT-87).
    addDevice(pro);
    const doc = serverHtml(<ProductListView myDevicesDefault={ON} />);

    expect(doc.innerHTML).not.toContain(pro.name);
    expect(results(doc)).toHaveClass(
      "[html[data-device-filter]:not([data-device-filter-expired])_&]:hidden",
    );
    expect(skeleton(doc)).toHaveClass(
      "hidden",
      "[html[data-device-filter]:not([data-device-filter-expired])_&]:block",
    );
    expect(doc.querySelector("p[aria-live='polite']")).toHaveClass(
      "[html[data-device-filter]:not([data-device-filter-expired])_&]:invisible",
    );
  });

  it.each([
    ["compat=off in the URL", "compat=off", {}],
    ["a device in the URL", "device=galaxy-s24", {}],
    ["a route-locked device", "", { lockedDevice: { slug: "iphone-15-pro" } }],
  ])("server HTML: nothing hidden with %s", (_, query, extra) => {
    currentQuery = query;
    const doc = serverHtml(
      <ProductListView myDevicesDefault={ON} {...extra} />,
    );
    expect(skeleton(doc)).toBeNull();
    expect(results(doc)?.className ?? "").toBe("");
  });

  it("server HTML: nothing hidden on a route without the default (/promo)", () => {
    currentPathname = "/promo";
    const doc = serverHtml(<ProductListView lockedOnSale anchorId="deals" />);
    expect(skeleton(doc)).toBeNull();
    expect(results(doc)?.className ?? "").toBe("");
  });

  it("after hydration: no CSS gate — the list shows its own state", async () => {
    installCatalogHandlers();
    addDevice(pro);
    const { container } = renderWithProviders(
      <ProductListView myDevicesDefault={ON} />,
    );
    await screen.findByText("Alpha Case");
    expect(skeleton(container)).toBeNull();
    expect(results(container)?.className ?? "").toBe("");
  });

  it("never shows another device's count as the placeholder", async () => {
    installCatalogHandlers();
    // The device-filtered listing never answers: its count stays pending.
    server.use(
      http.get("*/api/products", ({ request }) =>
        new URL(request.url).searchParams.has("device")
          ? new Promise<never>(() => {})
          : undefined,
      ),
    );
    addDevice(pro);
    currentQuery = "compat=off";
    const { rerender } = renderWithProviders(
      <ProductListView myDevicesDefault={ON} />,
    );
    await screen.findByText("Alpha Case");
    expect(screen.getByTestId("toolbar-result-count")).toHaveTextContent(
      dict.catalog.countProducts(1),
    );

    // The default applies — as on the first render after hydration.
    currentQuery = "";
    rerender(<ProductListView myDevicesDefault={ON} />);

    expect(screen.queryByTestId("toolbar-result-count")).toBeNull();
    expect(
      screen.queryByText(dict.catalog.countProducts(1)),
    ).not.toBeInTheDocument();
  });

  // TASK-2564 — the route read the default from the `catalog-device` cookie
  // and prefetched the filtered listing: the server and hydration renders ask
  // for that very query, and there is nothing to hide behind the skeleton.
  describe("with the server's device (TASK-2564)", () => {
    const deviceState = () => {
      const server = new QueryClient();
      server.setQueryData(
        getProductControllerFindAllQueryKey(
          buildCatalogListingParams((key) =>
            key === "device" ? pro.slug : null,
          ),
        ),
        {
          data: [makeProduct("p-fit", "Fitting Case")],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        },
      );
      return dehydrate(server);
    };

    it("server HTML: the prefetched filtered grid, no gate, no skeleton", () => {
      const doc = serverHtml(
        <HydrationBoundary state={deviceState()}>
          <ProductListView myDevicesDefault={ON} serverDevice={pro.slug} />
        </HydrationBoundary>,
      );

      expect(doc.textContent).toContain("Fitting Case");
      expect(skeleton(doc)).toBeNull();
      expect(results(doc)?.className ?? "").toBe("");
      expect(doc.querySelector("p[aria-live='polite']")).not.toHaveClass(
        "[html[data-device-filter]:not([data-device-filter-expired])_&]:invisible",
      );
    });

    it("after hydration the same saved device keeps the key — no second request", async () => {
      const productRequests = installCatalogHandlers();
      addDevice(pro);

      renderWithProviders(
        <HydrationBoundary state={deviceState()}>
          <ProductListView myDevicesDefault={ON} serverDevice={pro.slug} />
        </HydrationBoundary>,
        {
          queryClient: new QueryClient({
            defaultOptions: {
              queries: { retry: false, staleTime: 5 * 60 * 1000 },
            },
          }),
        },
      );

      expect(screen.getByText("Fitting Case")).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(
        productRequests.filter(
          (url) =>
            url.searchParams.get("limit") !== "1" &&
            url.searchParams.get("device") === pro.slug,
        ),
      ).toHaveLength(0);
    });

    it.each([
      ["compat=off", "compat=off"],
      ["a device in the URL", "device=galaxy-s24"],
    ])("never stands in for %s", (_, query) => {
      currentQuery = query;
      const doc = serverHtml(
        <HydrationBoundary state={deviceState()}>
          <ProductListView myDevicesDefault={ON} serverDevice={pro.slug} />
        </HydrationBoundary>,
      );
      expect(doc.textContent).not.toContain("Fitting Case");
    });
  });
});
