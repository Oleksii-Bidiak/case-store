import { http, HttpResponse, delay } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ProductList } from "./product-list";
import { ProductListSkeleton } from "./product-list-skeleton";

function variantSummary(overrides: Record<string, unknown> = {}) {
  return {
    groupId: null,
    variantCount: 1,
    priceFrom: "100.00",
    defaultVariantId: "product-1",
    defaultVariantSlug: "product-1",
    defaultInStock: true,
    colors: [],
    ...overrides,
  };
}

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
    variantSummary: variantSummary({
      defaultVariantId: id,
      defaultVariantSlug: id,
    }),
  };
}

type Product = ReturnType<typeof makeProduct>;

/**
 * Install a page-aware products handler: `pagesByCategory[categoryId][page]`
 * (categoryId "" = no category filter). `slowPages` adds a real delay so tests
 * can observe the in-flight state of an append.
 */
function installProducts(
  pagesByCategory: Record<string, Record<number, Product[]>>,
  { limit, slowPages = [] }: { limit: number; slowPages?: number[] },
) {
  server.use(
    http.get("*/api/products", async ({ request }) => {
      const url = new URL(request.url);
      const page = Number(url.searchParams.get("page") ?? "1");
      const categoryId = url.searchParams.get("categoryId") ?? "";
      const pages = pagesByCategory[categoryId] ?? {};
      const total = Object.values(pages).flat().length;
      if (slowPages.includes(page)) await delay(150);
      return HttpResponse.json({
        data: pages[page] ?? [],
        meta: {
          total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    }),
  );
}

const baseProps = {
  buildPageHref: (page: number) => `/products?page=${page}`,
  view: "grid" as const,
  onClearFilters: jest.fn(),
};

const CAT_1_PAGES: Record<number, Product[]> = {
  1: [makeProduct("p1", "Alpha Case"), makeProduct("p2", "Beta Case")],
  2: [makeProduct("p3", "Gamma Case"), makeProduct("p4", "Delta Case")],
  3: [makeProduct("p5", "Epsilon Case")],
};

describe("ProductList load-more append (TASK-216)", () => {
  it("appends the next page on «Показати ще» without dropping already-shown items, then finishes on the last page", async () => {
    const user = userEvent.setup();
    installProducts({ "": CAT_1_PAGES }, { limit: 2 });

    renderWithProviders(
      <ProductList {...baseProps} params={{ page: 1, limit: 2 }} />,
    );

    await screen.findByText("Alpha Case");
    // 2 items shown of 5; the next append brings a full page of 2.
    expect(
      screen.getByText(dict.catalog.shownOfTotal(2, 5)),
    ).toBeInTheDocument();
    const loadMore = screen.getByRole("button", {
      name: dict.catalog.loadMore(2),
    });

    await user.click(loadMore);

    await screen.findByText("Gamma Case");
    // Page 1 is still on screen — append, not replace.
    expect(screen.getByText("Alpha Case")).toBeInTheDocument();
    expect(
      screen.getByText(dict.catalog.shownOfTotal(4, 5)),
    ).toBeInTheDocument();

    // Final page has 1 remaining item (singular label).
    await user.click(
      screen.getByRole("button", { name: dict.catalog.loadMore(1) }),
    );

    await screen.findByText("Epsilon Case");
    expect(
      screen.getByText(dict.catalog.shownOfTotal(5, 5)),
    ).toBeInTheDocument();
    // Everything is loaded: the button unmounts and focus moves to the status
    // line instead of being dropped on <body>.
    expect(
      screen.queryByRole("button", { name: /Показати ще/ }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(dict.catalog.shownOfTotal(5, 5))).toHaveFocus(),
    );
  });

  it("announces the loading state and keeps focus on the button while a page is appending", async () => {
    const user = userEvent.setup();
    installProducts({ "": CAT_1_PAGES }, { limit: 2, slowPages: [2] });

    renderWithProviders(
      <ProductList {...baseProps} params={{ page: 1, limit: 2 }} />,
    );

    await screen.findByText("Alpha Case");
    const loadMore = screen.getByRole("button", {
      name: dict.catalog.loadMore(2),
    });

    await user.click(loadMore);

    // While page 2 is in flight: busy state + loading label, focus retained
    // (aria-disabled, not disabled — a disabled button would drop focus).
    await waitFor(() => expect(loadMore).toHaveAttribute("aria-busy", "true"));
    expect(loadMore).toHaveAttribute("aria-disabled", "true");
    expect(loadMore).toHaveTextContent(dict.catalog.loadMoreLoading);
    expect(loadMore).toHaveFocus();

    // Clicking again while busy must NOT append another page.
    await user.click(loadMore);

    await screen.findByText("Gamma Case");
    expect(loadMore).toHaveFocus();
    expect(loadMore).toHaveTextContent(dict.catalog.loadMore(1));
    expect(screen.queryByText("Epsilon Case")).not.toBeInTheDocument();
  });

  it("resets the accumulated pages when the filters change", async () => {
    const user = userEvent.setup();
    installProducts(
      {
        "cat-1": CAT_1_PAGES,
        "cat-2": {
          1: [
            makeProduct("x1", "Xi Charger"),
            makeProduct("x2", "Psi Charger"),
          ],
          2: [makeProduct("x3", "Omega Charger")],
        },
      },
      { limit: 2 },
    );

    const { rerender } = renderWithProviders(
      <ProductList
        {...baseProps}
        params={{ categoryId: "cat-1", page: 1, limit: 2 }}
      />,
    );

    await screen.findByText("Alpha Case");
    await user.click(
      screen.getByRole("button", { name: dict.catalog.loadMore(2) }),
    );
    await screen.findByText("Gamma Case");

    // Filter change (new categoryId) → accumulation resets to base page only.
    rerender(
      <ProductList
        {...baseProps}
        params={{ categoryId: "cat-2", page: 1, limit: 2 }}
      />,
    );

    await screen.findByText("Xi Charger");
    expect(screen.queryByText("Alpha Case")).not.toBeInTheDocument();
    expect(screen.queryByText("Gamma Case")).not.toBeInTheDocument();
    expect(
      screen.getByText(dict.catalog.shownOfTotal(2, 3)),
    ).toBeInTheDocument();
  });

  // TASK-415 supersedes TASK-259-G (F-19): the owner chose an explicit
  // 1 / 2 / 4 ladder over the auto-fill layout — one card below 390px (the
  // smallest phones were squeezing two unreadable cards side by side), two from
  // 390px, four from `lg`. The skeleton must declare the SAME columns, or the
  // page reflows the moment real cards replace it.
  it("renders the grid one-up under 390px, two-up from 390px and four-up from lg (TASK-415)", async () => {
    installProducts({ "": CAT_1_PAGES }, { limit: 2 });

    renderWithProviders(
      <ProductList {...baseProps} params={{ page: 1, limit: 2 }} />,
    );

    const card = await screen.findByText("Alpha Case");
    const grid = card.closest(".grid");
    expect(grid).not.toBeNull();
    expect(grid).toHaveClass(
      "grid-cols-1",
      "min-[390px]:grid-cols-2",
      "lg:grid-cols-4",
    );
    // Cards in a row share one height whatever their title/badge count.
    expect(grid).toHaveClass("items-stretch");
    // The old auto-fill layout is gone, not merely overridden.
    expect(grid?.className).not.toContain("grid-template-columns");
  });

  it("lays the skeleton out in exactly the same columns as the real grid (TASK-415)", async () => {
    installProducts({ "": CAT_1_PAGES }, { limit: 2 });

    renderWithProviders(
      <ProductList {...baseProps} params={{ page: 1, limit: 2 }} />,
    );
    const realGrid = (await screen.findByText("Alpha Case")).closest(".grid");

    const { container } = renderWithProviders(<ProductListSkeleton />);
    const skeletonGrid = container.querySelector(".grid");

    // Byte-identical, not merely "both responsive": any drift here is a visible
    // reflow when the skeleton is replaced by cards.
    expect(skeletonGrid?.className).toBe(realGrid?.className);
  });

  it("resets the accumulated pages when the base ?page= changes (back/forward, pagination links)", async () => {
    const user = userEvent.setup();
    installProducts({ "": CAT_1_PAGES }, { limit: 2 });

    const { rerender } = renderWithProviders(
      <ProductList {...baseProps} params={{ page: 1, limit: 2 }} />,
    );

    await screen.findByText("Alpha Case");
    await user.click(
      screen.getByRole("button", { name: dict.catalog.loadMore(2) }),
    );
    await screen.findByText("Gamma Case");

    // Simulates a pagination-link click / back-forward: URL page becomes 3.
    rerender(<ProductList {...baseProps} params={{ page: 3, limit: 2 }} />);

    await screen.findByText("Epsilon Case");
    expect(screen.queryByText("Alpha Case")).not.toBeInTheDocument();
    expect(
      screen.getByText(dict.catalog.shownOfTotal(1, 5)),
    ).toBeInTheDocument();
  });
});

describe("ProductList — quick-view trigger wiring (TASK-086)", () => {
  /** Detail + wishlist handlers the opened quick-view dialog needs. */
  function installQuickViewHandlers() {
    server.use(
      http.get("*/api/products/:slug", ({ params }) =>
        HttpResponse.json({
          data: makeProduct(params.slug as string, "Alpha Case"),
          category: { id: "cat-1", name: "Чохли", slug: "cases" },
          group: null,
          images: [],
        }),
      ),
      http.get("*/api/wishlist", () =>
        HttpResponse.json({ data: { items: [], itemCount: 0 } }),
      ),
    );
  }

  it("renders a quick-view trigger on each grid card and opens the dialog without navigating", async () => {
    installProducts(
      { "": { 1: [makeProduct("p1", "Alpha Case")] } },
      {
        limit: 20,
      },
    );
    installQuickViewHandlers();
    const user = userEvent.setup();

    renderWithProviders(
      <ProductList {...baseProps} params={{ page: 1, limit: 20 }} />,
    );

    const trigger = await screen.findByRole("button", {
      name: dict.quickView.trigger("Alpha Case"),
    });
    // The card's own name is a real <a> to the PDP; the trigger is a sibling
    // button above the stretched link — clicking it opens the preview, and the
    // anchor's href is untouched (no client-side navigation).
    const cardLink = screen.getByRole("link", { name: "Alpha Case" });
    expect(cardLink).toHaveAttribute("href", "/products/p1");

    await user.click(trigger);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Alpha Case" }),
    ).toBeInTheDocument();
  });

  it("renders a quick-view trigger on the list-row layout and opens the dialog", async () => {
    installProducts(
      { "": { 1: [makeProduct("p1", "Alpha Case")] } },
      {
        limit: 20,
      },
    );
    installQuickViewHandlers();
    const user = userEvent.setup();

    renderWithProviders(
      <ProductList
        {...baseProps}
        view="list"
        params={{ page: 1, limit: 20 }}
      />,
    );

    await user.click(
      await screen.findByRole("button", {
        name: dict.quickView.trigger("Alpha Case"),
      }),
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
