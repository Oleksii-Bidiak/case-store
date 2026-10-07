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
import { dict } from "@/shared/config";
import { countLabel } from "@/shared/lib/plural";
import { formatCurrency, formatDate, formatDateTime } from "@/shared/lib";
import { AdminProductTable } from "./admin-product-table";

const mockReplace = jest.fn();
const mockPush = jest.fn();
// The view is a URL state (quick views, filters, deleted view), so the query
// string has to be steerable per test.
const mockSearchParamsRef = { current: new URLSearchParams("") };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => "/products",
  useSearchParams: () => mockSearchParamsRef.current,
}));

// `toast.undo` carries the «Скасувати» of a bulk action (wave 198). Mocked so a
// test can read the message and press the action without a <Toaster>.
const toastUndo = jest.fn();
const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    undo: (...args: unknown[]) => toastUndo(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
    dismiss: jest.fn(),
  },
}));

const d = dict.products;
const r = dict.common.registry;
const forms = d.itemForms;

function setViewport(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: mobile,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  mockReplace.mockClear();
  mockPush.mockClear();
  toastUndo.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  localStorage.clear();
  setViewport(false);
});

afterEach(() => {
  mockSearchParamsRef.current = new URLSearchParams("");
});

afterAll(() => {
  window.matchMedia = originalMatchMedia;
});

const P1 = "iPhone 15 Pro Case";
const P2 = "Galaxy S24 Case";

function makeProductRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "product-1",
    name: P1,
    slug: "iphone-15-pro-case",
    price: "499.00",
    categoryId: "cat-1",
    isActive: true,
    // TASK-254: admin list items are ProductEntity with the derived stock split.
    stock: 10,
    reservedQty: 3,
    physicalQty: 13,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-02T10:00:00.000Z",
    ...overrides,
  };
}

/** A node of the nested category tree, valid for both the admin and public read. */
interface TreeNodeStub {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  depth: number;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
  subtreeProductCount: number;
  children: TreeNodeStub[];
}

function treeNode(
  id: string,
  name: string,
  children: TreeNodeStub[] = [],
  parentId: string | null = null,
  depth = 1,
): TreeNodeStub {
  return {
    id,
    name,
    slug: id,
    parentId,
    depth,
    isActive: true,
    sortOrder: 0,
    productCount: 0,
    subtreeProductCount: 0,
    children,
  };
}

function categoryTreeHandlers(
  tree: TreeNodeStub[] = [treeNode("cat-1", "Cases")],
) {
  return [
    http.get("*/api/categories/admin/tree", () =>
      HttpResponse.json({ data: tree }),
    ),
    http.get("*/api/categories/tree", () => HttpResponse.json({ data: tree })),
  ];
}

/**
 * The listing. The registry also asks for the quick-view counters — the same
 * endpoint with `limit=1` — so the MAIN request is told apart by its limit.
 */
function stubList(rows: unknown[] = [makeProductRow()], total?: number) {
  const queries: URLSearchParams[] = [];
  server.use(
    http.get("*/api/products/admin/list", ({ request }) => {
      const params = new URL(request.url).searchParams;
      queries.push(params);
      return HttpResponse.json({
        data: params.get("limit") === "1" ? rows.slice(0, 1) : rows,
        meta: {
          total: total ?? rows.length,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      });
    }),
    ...categoryTreeHandlers(),
  );
  return {
    queries,
    /** Requests of the table itself (not the counters). */
    main: () => queries.filter((q) => q.get("limit") !== "1"),
    counters: () => queries.filter((q) => q.get("limit") === "1"),
  };
}

function renderTable(options: { permissions?: string[] } = {}) {
  return renderWithProviders(
    <WithAuth
      isOwner={options.permissions === undefined}
      permissions={options.permissions ?? []}
    >
      <AdminProductTable />
    </WithAuth>,
  );
}

const selectRow = (name: string) =>
  userEvent.click(
    screen.getByRole("checkbox", { name: r.selectRowAria(name) }),
  );

const openRowMenu = async (name: string) => {
  await userEvent.click(
    screen.getByRole("button", { name: r.rowActionsAria(name) }),
  );
  return screen.findByRole("menu");
};

const lastUrl = () => String(mockReplace.mock.calls.at(-1)?.[0] ?? "");

/* ── header, quick views, toolbar ─────────────────────────────────────── */

describe("AdminProductTable — header and quick views (TASK-1048)", () => {
  it("draws the header with «Додати товар» for a products:write holder", async () => {
    stubList();
    renderTable({ permissions: ["products:read", "products:write"] });
    await screen.findByText(P1);

    expect(
      screen.getByRole("heading", { level: 2, name: d.heading }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: d.add })).toHaveAttribute(
      "href",
      "/products/new",
    );
  });

  it("offers the five quick views with the API's own counts", async () => {
    const list = stubList([makeProductRow()], 7);
    renderTable();
    await screen.findByText(P1);

    const tabs = screen.getByRole("tablist", { name: r.quickViewsLabel });
    for (const label of [
      d.viewAll,
      d.viewActive,
      d.viewHidden,
      d.viewOut,
      d.filterDeleted,
    ]) {
      expect(
        within(tabs).getByRole("tab", { name: new RegExp(label) }),
      ).toBeInTheDocument();
    }
    // Counts come from `meta.total` of one-row requests, one per view.
    await waitFor(() => expect(list.counters()).toHaveLength(5));
    await waitFor(() =>
      expect(
        within(tabs).getByRole("tab", { name: new RegExp(d.viewAll) }),
      ).toHaveTextContent("7"),
    );
    const counterQueries = list.counters().map((q) => q.toString());
    expect(counterQueries.some((q) => q.includes("isActive=true"))).toBe(true);
    expect(counterQueries.some((q) => q.includes("isActive=false"))).toBe(true);
    expect(counterQueries.some((q) => q.includes("outOfStock=true"))).toBe(
      true,
    );
    expect(counterQueries.some((q) => q.includes("deleted=true"))).toBe(true);
  });

  it.each([
    [d.viewActive, "status=active"],
    [d.viewHidden, "status=hidden"],
    [d.viewOut, "stock=out"],
    [d.filterDeleted, "deleted=only"],
  ])(
    "«%s» writes the same URL param the old filter did (%s)",
    async (label, param) => {
      stubList();
      renderTable();
      await screen.findByText(P1);

      await userEvent.click(
        screen.getByRole("tab", { name: new RegExp(label) }),
      );
      expect(lastUrl()).toContain(param);
    },
  );

  it("marks the quick view a deep link points at", async () => {
    mockSearchParamsRef.current = new URLSearchParams("status=hidden");
    const list = stubList();
    renderTable();
    await screen.findByText(P1);

    expect(
      screen.getByRole("tab", { name: new RegExp(d.viewHidden) }),
    ).toHaveAttribute("aria-selected", "true");
    expect(list.main()[0].get("isActive")).toBe("false");
  });

  it("«Усі» clears the status, stock and deleted params", async () => {
    mockSearchParamsRef.current = new URLSearchParams("stock=out&search=clear");
    stubList();
    renderTable();
    await screen.findByText(P1);

    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(d.viewAll) }),
    );
    expect(lastUrl()).not.toContain("stock=");
    // The search is not part of a quick view — it survives.
    expect(lastUrl()).toContain("search=clear");
  });

  it("names the searched fields in the search box", async () => {
    stubList();
    renderTable();
    await screen.findByText(P1);

    expect(
      screen.getByPlaceholderText(d.searchPlaceholder),
    ).toBeInTheDocument();
  });
});

/* ── filters ──────────────────────────────────────────────────────────── */

describe("AdminProductTable — «Фільтри» (TASK-1048)", () => {
  function stubSheetData() {
    server.use(
      http.get("*/api/brands", () =>
        HttpResponse.json({
          data: [
            { id: "brand-1", name: "Spigen", slug: "spigen" },
            { id: "brand-2", name: "Apple", slug: "apple" },
          ],
        }),
      ),
      http.get("*/api/device-models", () =>
        HttpResponse.json({
          data: [
            {
              id: "model-1",
              name: "iPhone 15",
              slug: "iphone-15",
              brandName: "Apple",
            },
          ],
          meta: { total: 1, page: 1, limit: 200, totalPages: 1 },
        }),
      ),
    );
  }

  const openSheet = () =>
    userEvent.click(
      screen.getByRole("button", { name: new RegExp(r.filters) }),
    );

  it("keeps the old status filter reachable — in the sheet, into the URL", async () => {
    stubList();
    stubSheetData();
    renderTable();
    await screen.findByText(P1);

    await openSheet();
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(
      within(
        within(sheet).getByRole("group", { name: d.filterStatus }),
      ).getByRole("button", { name: d.filterStatusHidden }),
    );
    await userEvent.click(
      within(sheet).getByRole("button", { name: d.filtersApply }),
    );
    expect(lastUrl()).toContain("status=hidden");
  });

  it("keeps the stock filter and the deleted view reachable too", async () => {
    stubList();
    stubSheetData();
    renderTable();
    await screen.findByText(P1);

    await openSheet();
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(
      within(
        within(sheet).getByRole("group", { name: d.filterStock }),
      ).getByRole("button", { name: d.filterStockOut }),
    );
    await userEvent.click(
      within(
        within(sheet).getByRole("group", { name: d.filterStatus }),
      ).getByRole("button", { name: d.filterDeleted }),
    );
    await userEvent.click(
      within(sheet).getByRole("button", { name: d.filtersApply }),
    );
    expect(lastUrl()).toContain("stock=out");
    expect(lastUrl()).toContain("deleted=only");
  });

  it("sends the brand, price and in-stock filters the API already supports", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "brandId=brand-1&minPrice=100&maxPrice=900&stock=in&categoryId=cat-1&deviceModelId=model-1",
    );
    const list = stubList();
    stubSheetData();
    renderTable();
    await screen.findByText(P1);

    const main = list.main()[0];
    expect(main.get("brandId")).toBe("brand-1");
    expect(main.get("minPrice")).toBe("100");
    expect(main.get("maxPrice")).toBe("900");
    expect(main.get("inStock")).toBe("true");
    expect(main.get("categoryId")).toBe("cat-1");
    expect(main.get("deviceModelId")).toBe("model-1");

    // One chip per applied filter, each removable on its own.
    expect(
      await screen.findByRole("button", {
        name: r.removeChipAria(d.chipBrand("Spigen")),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: r.removeChipAria(d.chipCategory("Cases")),
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: r.removeChipAria(d.chipDevice("iPhone 15")),
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", {
        name: r.removeChipAria(d.chipPrice("100", "900")),
      }),
    );
    expect(lastUrl()).not.toContain("minPrice");
    expect(lastUrl()).toContain("brandId=brand-1");
  });

  it("picks a brand in the sheet", async () => {
    stubList();
    stubSheetData();
    renderTable();
    await screen.findByText(P1);

    await openSheet();
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(
      await within(sheet).findByRole("button", { name: "Spigen" }),
    );
    await userEvent.click(
      within(sheet).getByRole("button", { name: d.filtersApply }),
    );
    expect(lastUrl()).toContain("brandId=brand-1");
  });
});

/* ── columns ──────────────────────────────────────────────────────────── */

describe("AdminProductTable — columns (TASK-1048)", () => {
  it("sorts on name, price and stock — the fields the API sorts by", async () => {
    stubList();
    renderTable();
    await screen.findByText(P1);

    for (const label of [d.colName, d.colPrice, d.colStock]) {
      expect(
        screen.getByRole("button", { name: dict.common.sortByAria(label) }),
      ).toBeInTheDocument();
    }
    await userEvent.click(
      screen.getByRole("button", {
        name: dict.common.sortByAria(d.colPrice),
      }),
    );
    expect(lastUrl()).toContain("sortBy=price");
    await userEvent.click(
      screen.getByRole("button", {
        name: dict.common.sortByAria(d.colStock),
      }),
    );
    expect(lastUrl()).toContain("sortBy=stock");
  });

  it("keeps «Створено» (and its sort) in «Колонки», hidden by default", async () => {
    stubList();
    renderTable();
    await screen.findByText(P1);

    expect(
      screen.queryByRole("button", {
        name: dict.common.sortByAria(d.colCreated),
      }),
    ).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: r.columns }));
    await userEvent.click(
      await screen.findByRole("checkbox", { name: d.colCreated }),
    );
    expect(
      await screen.findByRole("button", {
        name: dict.common.sortByAria(d.colCreated),
      }),
    ).toBeInTheDocument();
  });

  it("shows «Оновлено» from the payload's updatedAt", async () => {
    stubList();
    renderTable();
    await screen.findByText(P1);

    expect(
      screen.getByRole("columnheader", {
        name: new RegExp(`^${d.colUpdated}`),
      }),
    ).toBeInTheDocument();
    expect(
      document.querySelector('td[data-column-id="updated"]'),
    ).toHaveTextContent(formatDateTime("2026-06-02T10:00:00.000Z"));
  });

  it("flags a product with no photo and thumbnails one that has it", async () => {
    stubList([
      makeProductRow(),
      makeProductRow({
        id: "product-2",
        name: P2,
        primaryImage: {
          id: "img-1",
          url: "https://cdn.example.com/a.jpg",
          alt: null,
          blurDataUrl: null,
          sortOrder: 0,
          isPrimary: true,
        },
      }),
    ]);
    const { container } = renderTable();
    await screen.findByText(P1);

    expect(screen.getAllByText(d.noPhoto)).toHaveLength(1);
    expect(
      container.querySelector('img[src="https://cdn.example.com/a.jpg"]'),
    ).toBeInTheDocument();
  });

  it("shows the article number and brand under the name", async () => {
    stubList([
      makeProductRow({
        sku: "IP15-CLR",
        brand: { id: "b1", name: "Spigen", slug: "spigen" },
      }),
    ]);
    renderTable();
    await screen.findByText(P1);

    expect(screen.getByText("IP15-CLR · Spigen")).toBeInTheDocument();
  });

  it("strikes the old price through when there is one", async () => {
    stubList([makeProductRow({ price: "749.00", compareAtPrice: "999.00" })]);
    renderTable();
    await screen.findByText(P1);

    const old = formatCurrency("999.00");
    // Read out with its meaning; the struck-through figure is the visual.
    expect(screen.getByText(d.oldPriceAria(old))).toHaveClass("sr-only");
    expect(screen.getByText(old).tagName).toBe("S");
  });

  it("links the product name to its read-only card", async () => {
    stubList();
    renderTable();

    expect(await screen.findByRole("link", { name: P1 })).toHaveAttribute(
      "href",
      "/products/product-1",
    );
  });

  it("says «Показується» / «Приховано» instead of a raw toggle", async () => {
    stubList([
      makeProductRow(),
      makeProductRow({ id: "product-2", name: P2, isActive: false }),
    ]);
    renderTable();
    await screen.findByText(P1);

    expect(screen.getByText(d.statusShown)).toBeInTheDocument();
    expect(screen.getByText(d.statusHidden)).toBeInTheDocument();
  });
});

describe("AdminProductTable — «Залишок» (TASK-254, TASK-408, TASK-1048)", () => {
  it("says how many are free, with the reserve and the shelf underneath", async () => {
    stubList([makeProductRow({ stock: 10, reservedQty: 3, physicalQty: 13 })]);
    renderTable();
    await screen.findByText(P1);

    const cell = document.querySelector('td[data-column-id="stock"]');
    expect(cell).toHaveTextContent(d.stockFree(10));
    expect(cell).toHaveTextContent(d.stockReserved(3));
    expect(cell).toHaveTextContent(d.stockPhysical(13));
  });

  it("omits the reserve when nothing is reserved, and says «Немає» at zero", async () => {
    stubList([makeProductRow({ stock: 0, reservedQty: 0, physicalQty: 0 })]);
    renderTable();
    await screen.findByText(P1);

    const cell = document.querySelector('td[data-column-id="stock"]');
    expect(cell).toHaveTextContent(d.stockNone);
    expect(cell).toHaveTextContent(d.stockPhysical(0));
    expect(cell).not.toHaveTextContent(/резерв/);
  });

  it("explains the three numbers on the header — the artboard text", async () => {
    stubList();
    renderTable();
    await screen.findByText(P1);

    // The sort button is described by the full sentence (keyboard + SR).
    expect(
      screen.getByRole("button", { name: dict.common.sortByAria(d.colStock) }),
    ).toHaveAccessibleDescription(d.colStockHint);
  });

  it("adds the page's free stock to the totals row", async () => {
    stubList([
      makeProductRow({ stock: 10 }),
      makeProductRow({ id: "product-2", name: P2, stock: 5 }),
    ]);
    renderTable();
    await screen.findByText(P1);

    expect(
      screen.getByText(r.totalsOnPage(countLabel(2, forms))),
    ).toBeInTheDocument();
    expect(screen.getByText(d.totalsFree(15))).toBeInTheDocument();
  });

  it("says how many were found — the API's total", async () => {
    stubList([makeProductRow()], 42);
    renderTable();
    await screen.findByText(P1);

    expect(screen.getByText(countLabel(42, forms))).toBeInTheDocument();
  });
});

/* ── category column (TASK-717) ───────────────────────────────────────── */

describe("AdminProductTable — category column covers every depth (TASK-717)", () => {
  const LEAF_ID = "cat-leaf";
  const chain = [
    treeNode("cat-root", "Аксесуари", [
      treeNode(
        "cat-mid",
        "Чохли",
        [treeNode(LEAF_ID, "Чохли для iPhone", [], "cat-mid", 3)],
        "cat-root",
        2,
      ),
    ]),
  ];

  function stubLeafProduct() {
    const reads = { admin: 0, public: 0 };
    server.use(
      http.get("*/api/products/admin/list", () =>
        HttpResponse.json({
          data: [makeProductRow({ categoryId: LEAF_ID })],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
      http.get("*/api/categories/admin/tree", () => {
        reads.admin += 1;
        return HttpResponse.json({ data: chain });
      }),
      http.get("*/api/categories/tree", () => {
        reads.public += 1;
        return HttpResponse.json({ data: chain });
      }),
    );
    return reads;
  }

  const categoryCell = () =>
    document.querySelector('td[data-column-id="category"]');

  it("names a level-3 subcategory from the admin tree for a categories:write holder", async () => {
    const reads = stubLeafProduct();
    renderTable({ permissions: ["products:read", "categories:write"] });
    await screen.findByText(P1);

    await waitFor(() =>
      expect(categoryCell()).toHaveTextContent("Чохли для iPhone"),
    );
    expect(reads.admin).toBeGreaterThan(0);
    expect(reads.public).toBe(0);
  });

  it("names it for the owner too (every permission implicitly)", async () => {
    stubLeafProduct();
    renderTable();
    await screen.findByText(P1);

    await waitFor(() =>
      expect(categoryCell()).toHaveTextContent("Чохли для iPhone"),
    );
  });

  it("falls back to the public tree for a manager without categories:write — never asks the 403 route", async () => {
    const reads = stubLeafProduct();
    renderTable({ permissions: ["products:read"] });
    await screen.findByText(P1);

    await waitFor(() =>
      expect(categoryCell()).toHaveTextContent("Чохли для iPhone"),
    );
    expect(reads.public).toBeGreaterThan(0);
    expect(reads.admin).toBe(0);
  });

  it("still shows «—» for a category the tree does not contain", async () => {
    stubLeafProduct();
    server.use(
      http.get("*/api/categories/tree", () =>
        HttpResponse.json({ data: [treeNode("other", "Інше")] }),
      ),
    );
    renderTable({ permissions: ["products:read"] });
    await screen.findByText(P1);

    await waitFor(() => expect(categoryCell()).toHaveTextContent("—"));
    expect(categoryCell()).not.toHaveTextContent("Чохли для iPhone");
  });
});

/* ── row actions ──────────────────────────────────────────────────────── */

describe("AdminProductTable — row «⋯» (TASK-1048, TASK-1323)", () => {
  it("opens, edits, previews, hides and deletes for a full-rights session", async () => {
    stubList();
    renderTable();
    await screen.findByText(P1);

    const menu = await openRowMenu(P1);
    expect(
      within(menu).getByRole("menuitem", { name: d.rowOpen }),
    ).toHaveAttribute("href", "/products/product-1");
    expect(
      within(menu).getByRole("menuitem", { name: dict.common.edit }),
    ).toHaveAttribute("href", "/products/product-1/edit");
    expect(
      within(menu).getByRole("menuitem", { name: d.rowPreview }),
    ).toHaveAttribute("href", "/products/preview/iphone-15-pro-case");
    expect(
      within(menu).getByRole("menuitem", {
        name: dict.statusToggle.productDeactivate,
      }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: d.rowDelete }),
    ).toBeInTheDocument();
  });

  it("hides one product through the same endpoint the toggle used", async () => {
    stubList();
    let hits = 0;
    server.use(
      http.patch("*/api/products/product-1/deactivate", () => {
        hits += 1;
        return HttpResponse.json({ data: makeProductRow({ isActive: false }) });
      }),
    );
    renderTable();
    await screen.findByText(P1);

    const menu = await openRowMenu(P1);
    await userEvent.click(
      within(menu).getByRole("menuitem", {
        name: dict.statusToggle.productDeactivate,
      }),
    );
    await waitFor(() => expect(hits).toBe(1));
  });

  it("offers «Показати» on a hidden product", async () => {
    stubList([makeProductRow({ isActive: false })]);
    renderTable();
    await screen.findByText(P1);

    const menu = await openRowMenu(P1);
    expect(
      within(menu).getByRole("menuitem", {
        name: dict.statusToggle.productActivate,
      }),
    ).toBeInTheDocument();
  });

  it("without products:write: no edit, no show/hide — reading stays", async () => {
    stubList();
    renderTable({ permissions: ["products:read"] });
    await screen.findByText(P1);

    const menu = await openRowMenu(P1);
    expect(
      within(menu).getByRole("menuitem", { name: d.rowOpen }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: d.rowPreview }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: dict.common.edit }),
    ).toBeNull();
    expect(
      within(menu).queryByRole("menuitem", {
        name: dict.statusToggle.productDeactivate,
      }),
    ).toBeNull();
    expect(
      within(menu).queryByRole("menuitem", { name: d.rowDelete }),
    ).toBeNull();
  });

  it("opens the card on a row click", async () => {
    stubList();
    renderTable();
    const link = await screen.findByRole("link", { name: P1 });
    const row = link.closest("tr") as HTMLElement;
    await userEvent.click(within(row).getByText(d.statusShown));
    expect(mockPush).toHaveBeenCalledWith("/products/product-1");
  });
});

describe("AdminProductTable — delete a product (TASK-427)", () => {
  function stubDeletableRow() {
    const counts = { list: 0, deletes: 0 };
    server.use(
      http.get("*/api/products/admin/list", ({ request }) => {
        if (new URL(request.url).searchParams.get("limit") !== "1") {
          counts.list += 1;
        }
        return HttpResponse.json({
          data: [makeProductRow()],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        });
      }),
      ...categoryTreeHandlers(),
      http.delete("*/api/products/product-1", () => {
        counts.deletes += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    return counts;
  }

  const clickDelete = async () => {
    const menu = await openRowMenu(P1);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: d.rowDelete }),
    );
  };

  it("says what a soft delete actually does before asking to confirm", async () => {
    stubDeletableRow();
    renderTable();
    await screen.findByText(P1);

    await clickDelete();

    expect(await screen.findByText(d.deleteHeading)).toBeInTheDocument();
    expect(screen.getByText(d.deleteKeeps)).toBeInTheDocument();
    expect(screen.getByText(d.deleteFrees)).toBeInTheDocument();
    expect(screen.getByText(d.deleteAlternative)).toBeInTheDocument();
    // TASK-1829: a deleted product CAN come back (TASK-656) — the copy says
    // where and on what condition, not that it cannot.
    expect(d.deleteFrees).toContain("«Видалені»");
    expect(d.deleteFrees).toContain("«Відновити»");
    expect(d.deleteFrees).not.toMatch(/не вийде/);
  });

  it("sends nothing while the confirm is open, and DELETEs once confirmed", async () => {
    const counts = stubDeletableRow();
    renderTable();
    await screen.findByText(P1);

    await clickDelete();
    expect(counts.deletes).toBe(0);

    await userEvent.click(
      await screen.findByRole("button", { name: d.deleteConfirm }),
    );

    await waitFor(() => expect(counts.deletes).toBe(1));
    await waitFor(() => expect(counts.list).toBeGreaterThan(1));
  });

  it("offers no delete to a session without products:delete", async () => {
    stubDeletableRow();
    renderTable({ permissions: ["products:read", "products:write"] });
    await screen.findByText(P1);

    const menu = await openRowMenu(P1);
    expect(
      within(menu).queryByRole("menuitem", { name: d.rowDelete }),
    ).toBeNull();
  });
});

/** A tombstone as the admin list returns it: slug and SKU mangled (TASK-427). */
/** When the row was deleted — later than its `updatedAt` on purpose. */
const DELETED_AT = "2026-06-05T10:00:00.000Z";

const DELETED_ROW = makeProductRow({
  slug: "deleted:product-1:iphone-15-pro-case",
  sku: "deleted:product-1:IP15-CASE",
  isActive: false,
  // TASK-1830: the admin list says when and by whom.
  deletedAt: DELETED_AT,
  deletedBy: { id: "user-1", name: "Олена К." },
});

describe("AdminProductTable — the deleted view (TASK-427, TASK-656)", () => {
  it("asks for live products by default — the flag is absent, not false", async () => {
    const list = stubList();
    renderTable();
    await screen.findByText(P1);

    expect(list.main()[0].has("deleted")).toBe(false);
  });

  it("switches the listing to tombstones on ?deleted=only", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    const list = stubList([DELETED_ROW]);
    renderTable();
    await screen.findByText(P1);

    expect(list.main()[0].get("deleted")).toBe("true");
    expect(screen.getByText(d.deletedBadge)).toBeInTheDocument();
    // Т8: the summary counts deleted products, not «Знайдено».
    expect(screen.getByText(d.deletedSummary)).toBeInTheDocument();
  });

  // Т8: «Сортування: дата видалення, нові вгорі» — the product deleted by
  // mistake a minute ago is on page 1, not wherever its creation date lands.
  it("sorts the deleted view by deletion date, newest first, and says so", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    const list = stubList([DELETED_ROW]);
    renderTable();
    await screen.findByText(P1);

    expect(list.main()[0].get("sortBy")).toBe("deletedAt");
    expect(list.main()[0].get("sortOrder")).toBe("desc");
    expect(
      screen.getByText(r.summarySort(d.sortDeletedDesc), {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(r.summarySort(d.sortCreatedDesc), {
        exact: false,
      }),
    ).not.toBeInTheDocument();
  });

  it("names the view «Вид: Видалені», not «Усі товари» (TASK-1832, Т8)", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    stubList([DELETED_ROW]);
    renderTable();
    await screen.findByText(P1);

    expect(
      screen.getByRole("button", { name: r.view(d.filterDeleted) }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: r.view(d.viewDefault) }),
    ).not.toBeInTheDocument();
  });

  it("keeps a column the operator picked in the deleted view", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "deleted=only&sortBy=name&sortOrder=asc",
    );
    const list = stubList([DELETED_ROW]);
    renderTable();
    await screen.findByText(P1);

    expect(list.main()[0].get("sortBy")).toBe("name");
  });

  it("keeps the live list on creation date", async () => {
    const list = stubList();
    renderTable();
    await screen.findByText(P1);

    expect(list.main()[0].get("sortBy")).toBe("createdAt");
  });

  it("explains the view and no longer promises it is read-only (Т8)", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    stubList([DELETED_ROW]);
    renderTable();
    await screen.findByText(P1);

    const notice = screen.getByText(d.deletedNotice, { exact: false });
    expect(notice).toHaveTextContent(d.deletedNoticeRestoreLead);
    expect(notice).toHaveTextContent(d.deletedNoticeRestoreHidden);
    expect(notice).not.toHaveTextContent(/лише для довідки/);
  });

  it("shows the native артикул, not the tombstone's `deleted:<id>:` one", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    stubList([DELETED_ROW]);
    renderTable();
    await screen.findByText(P1);

    expect(screen.getByText("IP15-CASE")).toBeInTheDocument();
    expect(screen.queryByText(/deleted:product-1:/)).toBeNull();
  });

  it("offers no edit, no «⋯», no selection and no «Додати товар» — only «Відновити»", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    stubList([DELETED_ROW]);
    renderTable();
    await screen.findByText(P1);

    expect(screen.queryByRole("link", { name: P1 })).toBeNull();
    expect(
      screen.queryByRole("button", { name: r.rowActionsAria(P1) }),
    ).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: r.selectRowAria(P1) }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: d.add })).toBeNull();
    expect(screen.queryByText(d.bulkIdleHint)).toBeNull();
    expect(
      screen.getByRole("button", { name: d.restoreActionAria(P1) }),
    ).toHaveTextContent(d.restoreAction);
  });

  it("dates the row «видалено 05.06.2026» from deletedAt — no time (Т8, TASK-1830)", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    stubList([DELETED_ROW]);
    renderTable();
    await screen.findByText(P1);

    const cell = document.querySelector('td[data-column-id="updated"]');
    expect(cell).toHaveTextContent(d.deletedOn(formatDate(DELETED_AT)));
    expect(cell).not.toHaveTextContent(formatDateTime(DELETED_AT));
    // Not the `updatedAt` a later stock return could have moved.
    expect(cell).not.toHaveTextContent(
      d.deletedOn(formatDate("2026-06-02T10:00:00.000Z")),
    );
    // Т8: who deleted it, under the date.
    expect(cell).toHaveTextContent("Олена К.");
  });

  it("draws no «who» line when the log names no staff actor (TASK-1830)", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    stubList([{ ...DELETED_ROW, deletedBy: null }]);
    renderTable();
    await screen.findByText(P1);

    expect(
      document.querySelector('td[data-column-id="updated"]'),
    ).toHaveTextContent(new RegExp(`^${d.deletedOn(formatDate(DELETED_AT))}$`));
  });

  it("sorts «Оновлено» by deletion date in «Видалені» — the view's default, shown (TASK-1830)", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    stubList([DELETED_ROW]);
    renderTable();
    await screen.findByText(P1);

    const sortButton = screen.getByRole("button", {
      name: dict.common.sortByAria(d.colUpdated),
    });
    expect(sortButton).toHaveAccessibleDescription(d.colDeletedSortHint);
    expect(sortButton.closest("th")).toHaveAttribute("aria-sort", "descending");

    await userEvent.click(sortButton);
    expect(lastUrl()).toContain("sortBy=deletedAt");
    expect(lastUrl()).toContain("sortOrder=asc");
  });

  it("does not sort «Оновлено» on the live list", async () => {
    stubList();
    renderTable();
    await screen.findByText(P1);

    expect(
      screen.queryByRole("button", {
        name: dict.common.sortByAria(d.colUpdated),
      }),
    ).not.toBeInTheDocument();
  });

  it("counts the page as «Видалених на сторінці» with no free-stock sum (Т8)", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    stubList([DELETED_ROW]);
    renderTable();
    await screen.findByText(P1);

    const footer = document.querySelector("tfoot") as HTMLElement;
    expect(footer).toHaveTextContent(d.deletedTotalsOnPage(1));
    expect(footer).not.toHaveTextContent(r.totalsOnPage(countLabel(1, forms)));
    expect(footer).not.toHaveTextContent(d.totalsFree(10));
  });
});

/* ── restore (TASK-656, ProductsProposal Т8–Т12) ──────────────────────── */

describe("AdminProductTable — restore a deleted product (TASK-656)", () => {
  function stubRestorable(
    answers: Array<{ status: number; body?: unknown }> = [{ status: 201 }],
  ) {
    const bodies: unknown[] = [];
    const counts = { list: 0 };
    server.use(
      http.get("*/api/products/admin/list", ({ request }) => {
        if (new URL(request.url).searchParams.get("limit") !== "1") {
          counts.list += 1;
        }
        return HttpResponse.json({
          data: [DELETED_ROW],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        });
      }),
      ...categoryTreeHandlers(),
      http.post("*/api/products/product-1/restore", async ({ request }) => {
        bodies.push(await request.json());
        const answer = answers[Math.min(bodies.length, answers.length) - 1];
        if (answer.status >= 400) {
          return HttpResponse.json(answer.body ?? {}, {
            status: answer.status,
          });
        }
        return HttpResponse.json(
          {
            data: makeProductRow({ isActive: false }),
          },
          { status: answer.status },
        );
      }),
    );
    return { bodies, counts };
  }

  const openRestore = async () => {
    await userEvent.click(
      await screen.findByRole("button", { name: d.restoreActionAria(P1) }),
    );
    return screen.findByRole("alertdialog");
  };

  it("is offered only in «Видалені»", async () => {
    stubList();
    renderTable();
    await screen.findByText(P1);

    expect(
      screen.queryByRole("button", { name: d.restoreActionAria(P1) }),
    ).toBeNull();
  });

  it("is not offered without products:delete — and the notice says who can", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    stubList([DELETED_ROW]);
    renderTable({ permissions: ["products:read", "products:write"] });
    await screen.findByText(P1);

    expect(
      screen.queryByRole("button", { name: d.restoreActionAria(P1) }),
    ).toBeNull();
    const notice = screen.getByText(d.deletedNotice, { exact: false });
    expect(notice).toHaveTextContent(d.deletedNoticeNoRight);
    expect(notice).not.toHaveTextContent(d.deletedNoticeRestoreLead);
  });

  it("is offered to a manager who holds products:delete", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    stubList([DELETED_ROW]);
    renderTable({ permissions: ["products:read", "products:delete"] });
    await screen.findByText(P1);

    expect(
      screen.getByRole("button", { name: d.restoreActionAria(P1) }),
    ).toBeInTheDocument();
  });

  it("confirms with the native address and артикул, then POSTs an empty body (Т9)", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    const { bodies, counts } = stubRestorable();
    renderTable();
    await screen.findByText(P1);

    const dialog = await openRestore();
    expect(
      within(dialog).getByRole("heading", { name: d.restoreTitle }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("/products/iphone-15-pro-case"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("IP15-CASE")).toBeInTheDocument();
    expect(bodies).toHaveLength(0);

    await userEvent.click(
      within(dialog).getByRole("button", { name: d.restoreConfirm }),
    );

    await waitFor(() => expect(bodies).toEqual([{}]));
    await waitFor(() => expect(counts.list).toBeGreaterThan(1));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("toasts «… відновлено — він прихований.» with «Відкрити картку» (Т11)", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    stubRestorable();
    renderTable();
    await screen.findByText(P1);

    const dialog = await openRestore();
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.restoreConfirm }),
    );

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    const [message, options] = toastSuccess.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe(d.restoreToastDone(P1));
    expect(options.action.label).toBe(d.restoreToastOpen);

    options.action.onClick();
    expect(mockPush).toHaveBeenCalledWith("/products/product-1/edit");
  });

  it("asks for a new address on 409 PRODUCT_SLUG_CONFLICT and sends it on retry (Т10)", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    const { bodies } = stubRestorable([
      {
        status: 409,
        body: { error: "PRODUCT_SLUG_CONFLICT", message: "taken" },
      },
      { status: 201 },
    ]);
    renderTable();
    await screen.findByText(P1);

    const confirm = await openRestore();
    await userEvent.click(
      within(confirm).getByRole("button", { name: d.restoreConfirm }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: d.conflictTitleSlug,
    });
    const slug = within(dialog).getByRole("textbox", {
      name: d.conflictNewSlug,
    });
    expect(slug).toHaveValue("iphone-15-pro-case-2");
    expect(
      within(dialog).queryByRole("textbox", { name: d.conflictNewSku }),
    ).toBeNull();
    // Nothing restored yet — the toast waits for the retry.
    expect(toastSuccess).not.toHaveBeenCalled();

    await userEvent.clear(slug);
    await userEvent.type(slug, "iphone-15-pro-case-clear");
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.conflictConfirmSlug }),
    );

    await waitFor(() =>
      expect(bodies).toEqual([{}, { slug: "iphone-15-pro-case-clear" }]),
    );
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        d.restoreToastDone(P1),
        expect.anything(),
      ),
    );
  });

  // The whole flow from the row: «Відновити» → Т9 → an empty body → 409 naming
  // BOTH slots → Т10 with both fields prefilled → a retry carrying both → the
  // list refetched, the dialog gone, one toast.
  it("walks Відновити → 409 PRODUCT_SLUG_SKU_CONFLICT → retry with both (Т9–Т11)", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    const { bodies, counts } = stubRestorable([
      {
        status: 409,
        body: { error: "PRODUCT_SLUG_SKU_CONFLICT", message: "taken" },
      },
      { status: 201 },
    ]);
    renderTable();
    await screen.findByText(P1);

    const confirm = await openRestore();
    await userEvent.click(
      within(confirm).getByRole("button", { name: d.restoreConfirm }),
    );
    await waitFor(() => expect(bodies).toEqual([{}]));

    const dialog = await screen.findByRole("dialog", {
      name: d.conflictTitleBoth,
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // Т10 sets the taken values in mono inside the lead.
    expect(
      within(dialog).getByText("/products/iphone-15-pro-case"),
    ).toHaveClass("font-mono");
    expect(within(dialog).getByText("IP15-CASE")).toHaveClass("font-mono");
    expect(
      within(dialog).getByRole("textbox", { name: d.conflictNewSlug }),
    ).toHaveValue("iphone-15-pro-case-2");
    expect(
      within(dialog).getByRole("textbox", { name: d.conflictNewSku }),
    ).toHaveValue("IP15-CASE-2");
    const listBefore = counts.list;

    await userEvent.click(
      within(dialog).getByRole("button", { name: d.conflictConfirmBoth }),
    );

    await waitFor(() =>
      expect(bodies).toEqual([
        {},
        { slug: "iphone-15-pro-case-2", sku: "IP15-CASE-2" },
      ]),
    );
    await waitFor(() => expect(counts.list).toBeGreaterThan(listBefore));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith(
      d.restoreToastDone(P1),
      expect.anything(),
    );
  });

  it("shows «Видалено» and «Відновити» on the card below md (Т12)", async () => {
    setViewport(true);
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    stubList([DELETED_ROW]);
    renderTable();

    const card = await screen.findByRole("listitem", { name: P1 });
    expect(within(card).getByText(d.deletedBadge)).toBeInTheDocument();
    expect(within(card).getByText("IP15-CASE")).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: d.restoreActionAria(P1) }),
    ).toBeInTheDocument();
  });
});

/* ── bulk ─────────────────────────────────────────────────────────────── */

describe("AdminProductTable — bulk bar (TASK-838, TASK-1048)", () => {
  it("is always there: idle it says what selecting is for", async () => {
    stubList();
    renderTable();
    await screen.findByText(P1);

    expect(screen.getByText(d.bulkIdleHint)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: d.bulkHide })).toBeNull();

    await selectRow(P1);
    for (const label of [d.bulkShow, d.bulkHide, d.bulkGroup, d.bulkColor]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(
      screen.getByText(r.bulkSelected(countLabel(1, forms))),
    ).toBeInTheDocument();
  });

  it("without products:write: no checkbox column, no bulk bar, no «Додати товар»", async () => {
    stubList();
    renderTable({ permissions: ["products:read"] });
    await screen.findByText(P1);

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByText(d.bulkIdleHint)).toBeNull();
    expect(screen.queryByRole("link", { name: d.add })).toBeNull();
    expect(screen.queryByRole("button", { name: r.bulkMoreAria })).toBeNull();
    const row = screen.getByText(P1).closest("tr") as HTMLElement;
    expect(within(row).getAllByRole("cell").length).toBe(
      screen.getAllByRole("columnheader").length,
    );
  });
});

describe("AdminProductTable — bulk move to group (TASK-423)", () => {
  function stubGroupBulk() {
    const bodies: unknown[] = [];
    server.use(
      http.get("*/api/product-groups", () =>
        HttpResponse.json({
          data: [
            { id: "group-a", name: "Чохли Clear", isActive: true, axes: [] },
            { id: "group-b", name: "Чохли Silicone", isActive: true, axes: [] },
          ],
        }),
      ),
      http.patch("*/api/products/group", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: { updatedCount: 1 } });
      }),
    );
    return bodies;
  }

  async function pickGroup(name: string) {
    await userEvent.click(screen.getByRole("button", { name: d.bulkGroup }));
    await userEvent.click(
      await screen.findByLabelText(d.bulk.groupDialogLabel),
    );
    await userEvent.click(await screen.findByRole("option", { name }));
    await userEvent.click(
      screen.getByRole("button", { name: d.bulk.groupSubmit }),
    );
  }

  it("sends the selected ids and the chosen group", async () => {
    stubList();
    const bodies = stubGroupBulk();
    renderTable();
    await screen.findByText(P1);
    await selectRow(P1);

    await pickGroup("Чохли Silicone");

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ ids: ["product-1"], groupId: "group-b" });
  });

  it("sends groupId: null — not undefined — for «Без групи»", async () => {
    stubList();
    const bodies = stubGroupBulk();
    renderTable();
    await screen.findByText(P1);
    await selectRow(P1);

    await pickGroup(d.bulk.groupNone);

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ ids: ["product-1"], groupId: null });
  });

  it("refuses to submit until a target is picked", async () => {
    stubList();
    const bodies = stubGroupBulk();
    renderTable();
    await screen.findByText(P1);
    await selectRow(P1);

    await userEvent.click(screen.getByRole("button", { name: d.bulkGroup }));
    const submit = await screen.findByRole("button", {
      name: d.bulk.groupSubmit,
    });
    expect(submit).toBeDisabled();
    await userEvent.click(submit);
    expect(bodies).toHaveLength(0);
  });

  it("does not fetch the group list until the dialog is opened", async () => {
    stubList();
    let groupRequests = 0;
    server.use(
      http.get("*/api/product-groups", () => {
        groupRequests += 1;
        return HttpResponse.json({ data: [] });
      }),
    );
    renderTable();
    await screen.findByText(P1);
    await selectRow(P1);

    expect(groupRequests).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: d.bulkGroup }));
    await waitFor(() => expect(groupRequests).toBe(1));
  });

  it("clears the selection once the server confirms", async () => {
    stubList();
    stubGroupBulk();
    renderTable();
    await screen.findByText(P1);
    await selectRow(P1);

    await pickGroup("Чохли Clear");

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: d.bulkGroup })).toBeNull(),
    );
  });
});

describe("AdminProductTable — bulk set colour (TASK-487)", () => {
  let confirmSpy: jest.SpyInstance;
  beforeEach(() => {
    confirmSpy = jest.spyOn(window, "confirm");
  });
  afterEach(() => confirmSpy.mockRestore());

  function stubColorBulk() {
    const bodies: unknown[] = [];
    server.use(
      http.patch("*/api/products/color", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: { updatedCount: 1 } });
      }),
    );
    return bodies;
  }

  const openColor = () =>
    userEvent.click(screen.getByRole("button", { name: d.bulkColor }));

  it("sends the selected ids and the typed colour, trimmed", async () => {
    stubList();
    const bodies = stubColorBulk();
    renderTable();
    await screen.findByText(P1);
    await selectRow(P1);

    await openColor();
    await userEvent.type(
      await screen.findByLabelText(d.bulk.colorDialogLabel),
      "  Чорний ",
    );
    await userEvent.click(
      screen.getByRole("button", { name: d.bulk.colorSubmit }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ ids: ["product-1"], color: "Чорний" });
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("asks in an AlertDialog before clearing; cancel writes nothing", async () => {
    stubList();
    const bodies = stubColorBulk();
    renderTable();
    await screen.findByText(P1);
    await selectRow(P1);

    await openColor();
    await userEvent.click(
      await screen.findByRole("button", { name: d.bulk.colorClear }),
    );
    const prompt = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(prompt).getByRole("button", { name: dict.common.cancel }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(bodies).toHaveLength(0);
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe("AdminProductTable — bulk show / hide (TASK-355, TASK-812)", () => {
  function stubStatusBulk() {
    const bodies: unknown[] = [];
    server.use(
      http.patch("*/api/products/status", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: { updatedCount: 1 } });
      }),
    );
    return bodies;
  }

  it("asks in an AlertDialog before hiding; cancel sends nothing", async () => {
    const confirmSpy = jest.spyOn(window, "confirm");
    stubList();
    const bodies = stubStatusBulk();
    renderTable();
    await screen.findByText(P1);
    await selectRow(P1);

    await userEvent.click(screen.getByRole("button", { name: d.bulkHide }));
    const prompt = await screen.findByRole("alertdialog");
    expect(prompt).toHaveTextContent(d.bulk.deactivateConfirm(1));
    await userEvent.click(
      within(prompt).getByRole("button", { name: dict.common.cancel }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(bodies).toHaveLength(0);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("hides once confirmed; showing does not ask at all", async () => {
    stubList([makeProductRow({ isActive: false })]);
    const bodies = stubStatusBulk();
    renderTable();
    await screen.findByText(P1);
    await selectRow(P1);

    await userEvent.click(screen.getByRole("button", { name: d.bulkShow }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ ids: ["product-1"], isActive: true });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: d.bulkShow })).toBeNull(),
    );
    await selectRow(P1);
    await userEvent.click(screen.getByRole("button", { name: d.bulkHide }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: d.bulk.deactivate(1),
      }),
    );
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ ids: ["product-1"], isActive: false });
  });
});

/* ── undo (TASK-837) ──────────────────────────────────────────────────── */

describe("AdminProductTable — undo the last bulk action (TASK-837)", () => {
  function stubTwoRows() {
    stubList([
      makeProductRow({
        isActive: true,
        groupId: "group-a",
        attributes: { Колір: "Чорний" },
      }),
      makeProductRow({
        id: "product-2",
        name: P2,
        slug: "galaxy-s24-case",
        isActive: false,
        groupId: null,
        attributes: {},
      }),
    ]);
    server.use(
      http.get("*/api/product-groups", () =>
        HttpResponse.json({
          data: [
            { id: "group-a", name: "Чохли Clear", isActive: true, axes: [] },
            { id: "group-b", name: "Чохли Silicone", isActive: true, axes: [] },
          ],
        }),
      ),
    );
  }

  function recordPatch(path: string, status = 200) {
    const bodies: unknown[] = [];
    server.use(
      http.patch(`*/api/products/${path}`, async ({ request }) => {
        bodies.push(await request.json());
        return status === 200
          ? HttpResponse.json({ data: { updatedCount: 1 } })
          : HttpResponse.json({ message: "boom" }, { status });
      }),
    );
    return bodies;
  }

  async function selectBoth() {
    await selectRow(P1);
    await selectRow(P2);
  }

  /** «⋯» of the bulk bar → «Скасувати останню масову дію». */
  async function undoItem() {
    await userEvent.click(
      await screen.findByRole("button", { name: r.bulkMoreAria }),
    );
    return screen.findByRole("menuitem", { name: d.bulk.undo });
  }

  it("keeps the persistent undo in «⋯», inert before any bulk action", async () => {
    stubTwoRows();
    renderTable();
    await screen.findByText(P1);

    expect(await undoItem()).toHaveAttribute("aria-disabled", "true");
  });

  it("show → toast «Скасувати» and the menu item both put back only what changed", async () => {
    stubTwoRows();
    const bodies = recordPatch("status");
    renderTable();
    await screen.findByText(P1);
    await selectBoth();

    await userEvent.click(screen.getByRole("button", { name: d.bulkShow }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      ids: ["product-1", "product-2"],
      isActive: true,
    });

    // The toast names what changed — only product-2 actually changed.
    await waitFor(() => expect(toastUndo).toHaveBeenCalledTimes(1));
    const [message, options] = toastUndo.mock.calls[0] as [
      string,
      { onUndo: () => void },
    ];
    expect(message).toBe(d.toastShown(countLabel(1, forms)));
    await waitFor(() =>
      expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
        d.bulk.announceUndoAvailable(1, d.bulk.undo),
      ),
    );

    options.onUndo();
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ ids: ["product-2"], isActive: false });
    await waitFor(() =>
      expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
        d.bulk.announceUndone(1),
      ),
    );
    // Used up: the menu item is inert again.
    expect(await undoItem()).toHaveAttribute("aria-disabled", "true");
  });

  it("hide → the toast says they left the storefront", async () => {
    stubTwoRows();
    const bodies = recordPatch("status");
    renderTable();
    await screen.findByText(P1);
    await selectBoth();

    await userEvent.click(screen.getByRole("button", { name: d.bulkHide }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: d.bulk.deactivate(2),
      }),
    );
    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() =>
      expect(toastUndo).toHaveBeenCalledWith(
        d.toastHidden(countLabel(1, forms)),
        expect.objectContaining({ onUndo: expect.any(Function) }),
      ),
    );
  });

  it("move to group → menu undo sends one request per previous group, null included", async () => {
    stubTwoRows();
    const bodies = recordPatch("group");
    renderTable();
    await screen.findByText(P1);
    await selectBoth();

    await userEvent.click(screen.getByRole("button", { name: d.bulkGroup }));
    await userEvent.click(
      await screen.findByLabelText(d.bulk.groupDialogLabel),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Чохли Silicone" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: d.bulk.groupSubmit }),
    );
    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() =>
      expect(toastUndo).toHaveBeenCalledWith(
        d.toastGrouped(countLabel(2, forms)),
        expect.anything(),
      ),
    );

    const item = await undoItem();
    await waitFor(() =>
      expect(item).not.toHaveAttribute("aria-disabled", "true"),
    );
    await userEvent.click(item);

    await waitFor(() => expect(bodies).toHaveLength(3));
    expect(bodies.slice(1)).toEqual([
      { ids: ["product-1"], groupId: "group-a" },
      { ids: ["product-2"], groupId: null },
    ]);
  });

  it("set colour → undo restores each row's previous colour (or clears it)", async () => {
    stubTwoRows();
    const bodies = recordPatch("color");
    renderTable();
    await screen.findByText(P1);
    await selectBoth();

    await userEvent.click(screen.getByRole("button", { name: d.bulkColor }));
    await userEvent.type(
      await screen.findByLabelText(d.bulk.colorDialogLabel),
      "Білий",
    );
    await userEvent.click(
      screen.getByRole("button", { name: d.bulk.colorSubmit }),
    );
    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() => expect(toastUndo).toHaveBeenCalledTimes(1));
    expect(toastUndo.mock.calls[0][0]).toBe(
      d.toastColored(countLabel(2, forms)),
    );

    (toastUndo.mock.calls[0][1] as { onUndo: () => void }).onUndo();

    await waitFor(() => expect(bodies).toHaveLength(3));
    expect(bodies.slice(1)).toEqual([
      { ids: ["product-1"], color: "Чорний" },
      { ids: ["product-2"], color: null },
    ]);
  });

  it("offers nothing after a cancelled action", async () => {
    stubTwoRows();
    const bodies = recordPatch("status");
    renderTable();
    await screen.findByText(P1);
    await selectBoth();

    await userEvent.click(screen.getByRole("button", { name: d.bulkHide }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: dict.common.cancel,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(bodies).toHaveLength(0);
    expect(toastUndo).not.toHaveBeenCalled();
    expect(await undoItem()).toHaveAttribute("aria-disabled", "true");
  });

  it("a failed undo keeps the offer and says so", async () => {
    stubTwoRows();
    const bodies = recordPatch("status");
    renderTable();
    await screen.findByText(P1);
    await selectBoth();

    await userEvent.click(screen.getByRole("button", { name: d.bulkShow }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() => expect(toastUndo).toHaveBeenCalledTimes(1));

    const failed = recordPatch("status", 500);
    await userEvent.click(await undoItem());

    await waitFor(() =>
      expect(screen.getByTestId("tree-live-assertive")).toHaveTextContent(
        d.bulk.announceUndoFailed,
      ),
    );
    expect(failed).toEqual([{ ids: ["product-2"], isActive: false }]);
    expect(await undoItem()).not.toHaveAttribute("aria-disabled", "true");
  });

  it("the toast's «Скасувати» does nothing once the offer is used up", async () => {
    stubTwoRows();
    const bodies = recordPatch("status");
    renderTable();
    await screen.findByText(P1);
    await selectBoth();

    await userEvent.click(screen.getByRole("button", { name: d.bulkShow }));
    await waitFor(() => expect(toastUndo).toHaveBeenCalledTimes(1));
    const { onUndo } = toastUndo.mock.calls[0][1] as { onUndo: () => void };

    await userEvent.click(await undoItem());
    await waitFor(() => expect(bodies).toHaveLength(2));

    onUndo();
    // A second replay would be a stale snapshot written over the first.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bodies).toHaveLength(2);
  });
});

/* ── 390: cards ───────────────────────────────────────────────────────── */

describe("AdminProductTable — cards below md (Т7)", () => {
  it("shows a card per product with price, free stock, status and «⋯»", async () => {
    setViewport(true);
    stubList([makeProductRow({ sku: "IP15-CLR" })]);
    renderTable();

    const card = await screen.findByRole("listitem", { name: P1 });
    expect(within(card).getByText("IP15-CLR")).toBeInTheDocument();
    expect(within(card).getByText(d.stockFree(10))).toBeInTheDocument();
    expect(within(card).getByText(d.statusShown)).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: r.rowActionsAria(P1) }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("checkbox", { name: r.selectRowAria(P1) }),
    ).toBeInTheDocument();
  });

  it("dates a deleted card and names who deleted it (Т12, TASK-1830)", async () => {
    setViewport(true);
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    stubList([DELETED_ROW]);
    renderTable();

    const card = await screen.findByRole("listitem", { name: P1 });
    expect(
      within(card).getByText(
        `${d.deletedOn(formatDate(DELETED_AT))} · Олена К.`,
      ),
    ).toBeInTheDocument();
  });

  it("drops the checkbox from the card without products:write", async () => {
    setViewport(true);
    stubList();
    renderTable({ permissions: ["products:read"] });

    const card = await screen.findByRole("listitem", { name: P1 });
    expect(within(card).queryByRole("checkbox")).toBeNull();
  });
});
