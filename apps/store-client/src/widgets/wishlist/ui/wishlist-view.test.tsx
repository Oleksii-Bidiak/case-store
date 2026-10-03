import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import {
  getGetWishlistQueryKey,
  type WishlistItemEntity,
} from "@/entities/wishlist";
import { dict } from "@/shared/config";
import { WishlistView } from "./wishlist-view";
import { WishlistSkeleton } from "./wishlist-skeleton";

const mockReplace = jest.fn();
let currentQuery = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/wishlist",
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

/** Category / brand per product id, as the cards endpoint returns them. */
let cardFacets: Record<string, { categoryId: string; brand?: string }> = {};

/**
 * The two requests the rail adds (TASK-1300): product cards for the saved ids
 * (category + brand) and the category tree (names). Registered last wins in
 * MSW, so a test that adds its own `/api/products/:slug` handler calls this
 * again to keep `/api/products/cards` out of it.
 */
function registerRailHandlers() {
  server.use(
    http.get("*/api/products/cards", ({ request }) => {
      const ids =
        new URL(request.url).searchParams.get("ids")?.split(",") ?? [];
      return HttpResponse.json({
        data: ids
          .filter((id) => cardFacets[id])
          .map((id) => ({
            id,
            categoryId: cardFacets[id].categoryId,
            brand: cardFacets[id].brand
              ? {
                  id: `brand-${cardFacets[id].brand}`,
                  name: cardFacets[id].brand,
                  slug: cardFacets[id].brand,
                }
              : null,
          })),
      });
    }),
    http.get("*/api/categories/tree", () =>
      HttpResponse.json({
        data: [
          { id: "cat-cases", name: "Чохли", slug: "chohly", children: [] },
          { id: "cat-cables", name: "Кабелі", slug: "kabeli", children: [] },
        ],
      }),
    ),
  );
}

beforeEach(() => {
  mockReplace.mockClear();
  currentQuery = "";
  cardFacets = {};
  registerRailHandlers();
});

function buildItem(
  overrides: Partial<WishlistItemEntity> = {},
): WishlistItemEntity {
  return {
    id: "i1",
    productId: "p1",
    productName: "iPhone 15 Pro Case",
    productSlug: "iphone-15-pro-case",
    imageUrl: null,
    price: "29.99",
    compareAtPrice: null,
    maxQty: 10,
    isActive: true,
    createdAt: "2026-06-30T00:00:00.000Z",
    ...overrides,
  };
}

function seededClient(items: WishlistItemEntity[]): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(getGetWishlistQueryKey(), {
    data: {
      id: "w1",
      userId: null,
      items,
      itemCount: items.length,
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    },
  });
  return client;
}

describe("WishlistView (TASK-076)", () => {
  it("renders the empty state with a CTA when nothing is saved", () => {
    renderWithProviders(<WishlistView />, { queryClient: seededClient([]) });

    expect(screen.getByText(dict.wishlist.emptyHeading)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.wishlist.emptyCta }),
    ).toHaveAttribute("href", "/products");
  });

  it("renders saved products with a remove (heart) control linking to the PDP", () => {
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([buildItem()]),
    });

    const heading = screen.getByRole("heading", {
      name: dict.wishlist.heading,
    });
    expect(heading).toBeInTheDocument();

    const card = screen.getByRole("article");
    expect(
      within(card).getByRole("link", { name: "iPhone 15 Pro Case" }),
    ).toHaveAttribute("href", "/products/iphone-15-pro-case");
    // The heart toggle (filled, saved) offers removal.
    expect(
      within(card).getByRole("button", {
        name: dict.productCard.wishlistRemoveAria("iPhone 15 Pro Case"),
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores optimistic placeholders that lack a product slug", () => {
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([{ productId: "ghost" } as WishlistItemEntity]),
    });

    // No hydrated items → empty state, not a broken card.
    expect(screen.getByText(dict.wishlist.emptyHeading)).toBeInTheDocument();
  });

  // TASK-875 — owner decision 7.11: the page is «Обране» in every state.
  it("names the page «Обране» in the h1 and the breadcrumb, empty or not", () => {
    const { unmount } = renderWithProviders(<WishlistView />, {
      queryClient: seededClient([]),
    });

    expect(dict.wishlist.heading).toBe("Обране");
    expect(
      screen.getByRole("heading", { level: 1, name: "Обране" }),
    ).toBeInTheDocument();
    // The empty line is a sub-heading under the page title, not a second h1.
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: dict.wishlist.emptyHeading,
      }),
    ).toBeInTheDocument();
    const trail = screen.getByRole("navigation", {
      name: dict.product.breadcrumbAria,
    });
    expect(within(trail).getByText("Обране")).toHaveAttribute(
      "aria-current",
      "page",
    );
    unmount();

    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([buildItem()]),
    });
    expect(
      screen.getByRole("heading", { level: 1, name: "Обране" }),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("navigation", { name: dict.product.breadcrumbAria }),
      ).getByText("Обране"),
    ).toBeInTheDocument();
  });

  it("badges a discounted card with −N % like the catalogue card (TASK-875)", () => {
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([
        buildItem({ price: "75.00", compareAtPrice: "100.00" }),
      ]),
    });

    const card = screen.getByRole("article");
    expect(within(card).getByText("−25%")).toBeInTheDocument();
    expect(card.querySelector("[data-sold-out-veil]")).toBeNull();
    expect(
      within(card).queryByText(dict.product.outOfStock, {
        selector: "[data-slot=badge] span",
      }),
    ).toBeNull();
  });

  it.each([
    ["sold out", { maxQty: 0 }],
    ["withdrawn from sale", { isActive: false }],
  ])(
    "badges and dims a %s card like the catalogue card (TASK-875)",
    (_label, overrides) => {
      renderWithProviders(<WishlistView />, {
        queryClient: seededClient([buildItem(overrides)]),
      });

      const card = screen.getByRole("article");
      expect(
        within(card).getByText(dict.product.outOfStock, {
          selector: "[data-slot=badge] span",
        }),
      ).toBeInTheDocument();
      expect(card.querySelector("[data-sold-out-veil]")).not.toBeNull();
      expect(
        within(card).getByRole("button", { name: dict.addToCart.outOfStock }),
      ).toBeDisabled();
    },
  );

  it("gives every active-filter chip an sr-only «Прибрати фільтр» (TASK-875)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([
        buildItem({ price: "75.00", compareAtPrice: "100.00" }),
      ]),
    });

    await user.click(screen.getByRole("checkbox", { name: /Зі знижкою/ }));

    expect(
      screen.getByRole("button", {
        name: `${dict.wishlist.quickSale} ${dict.filters.removeFilter}`,
      }),
    ).toBeInTheDocument();
  });

  it("renders the redesigned toolbar and defaults to the grid view", () => {
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([buildItem()]),
    });

    expect(
      screen.getByRole("button", { name: dict.wishlist.addAll }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.filters.viewGrid }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("filters to sale items via the quick filter and surfaces a removable chip", async () => {
    const user = userEvent.setup();
    const saleItem = buildItem({
      id: "s1",
      productId: "s1",
      productName: "Sale Phone",
      productSlug: "sale-phone",
      price: "100.00",
      compareAtPrice: "150.00",
    });
    const fullItem = buildItem({
      id: "f1",
      productId: "f1",
      productName: "Full Phone",
      productSlug: "full-phone",
      price: "200.00",
      compareAtPrice: null,
    });

    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([saleItem, fullItem]),
    });

    expect(screen.getByText("Sale Phone")).toBeInTheDocument();
    expect(screen.getByText("Full Phone")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /Зі знижкою/ }));

    expect(screen.getByText("Sale Phone")).toBeInTheDocument();
    expect(screen.queryByText("Full Phone")).not.toBeInTheDocument();
    // The active-filter chip appears (a button that removes the filter).
    expect(
      screen.getByRole("button", { name: new RegExp(dict.wishlist.quickSale) }),
    ).toBeInTheDocument();
  });

  it("labels the mobile drawer's apply button with the saved-item count (TASK-084)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([buildItem()]),
    });

    await user.click(
      screen.getByRole("button", { name: dict.filters.filtersButton }),
    );

    const applyButton = await screen.findByRole("button", {
      name: dict.filters.mobileApply(1),
    });
    expect(applyButton).toBeEnabled();
    expect(applyButton).toHaveTextContent("Показати 1 товар");
  });

  // TASK-804: at zero matches the drawer's footer used to be a disabled
  // button, the «Скинути фільтри» lay under the drawer, and the × was the only
  // way out.
  it("offers a working reset in the drawer when no saved item matches", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WishlistView />, {
      // Full price only — «Зі знижкою» matches nothing.
      queryClient: seededClient([buildItem()]),
    });

    await user.click(
      screen.getAllByRole("checkbox", { name: /Зі знижкою/ })[0],
    );
    expect(screen.getByText(dict.wishlist.noMatchHeading)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Фільтри/ }));
    const drawer = await screen.findByRole("dialog", {
      name: dict.filters.legend,
    });
    expect(
      within(drawer).getByText(dict.filters.mobileApply(0)),
    ).toBeInTheDocument();

    await user.click(
      within(drawer).getByRole("button", { name: dict.filters.clear }),
    );

    // The filter is gone: the footer counts the saved item again.
    expect(
      await within(drawer).findByRole("button", {
        name: dict.filters.mobileApply(1),
      }),
    ).toBeEnabled();
  });
});

describe("WishlistView quick-view triggers (TASK-290)", () => {
  it("renders a quick-view trigger on each grid card", () => {
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([buildItem()]),
    });

    // Grid is the default view: the eye-icon trigger sits in the card's
    // hover-reveal overlay (present in the DOM, revealed on hover/keyboard focus),
    // mirroring how the catalog ProductCard injects it into its `hoverAction` slot.
    expect(
      screen.getByRole("button", {
        name: dict.quickView.trigger("iPhone 15 Pro Case"),
      }),
    ).toBeInTheDocument();
  });

  it("renders a quick-view trigger on each list row", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([buildItem()]),
    });

    await user.click(
      screen.getByRole("button", { name: dict.filters.viewList }),
    );

    // List row: the trigger is pinned to the thumbnail's top-right corner, the
    // same placement as the catalog list row (ProductListItem).
    expect(
      screen.getByRole("button", {
        name: dict.quickView.trigger("iPhone 15 Pro Case"),
      }),
    ).toBeInTheDocument();
  });

  it("opens the quick-view dialog for the saved product, fetching it by slug", async () => {
    const detailRequests: string[] = [];
    server.use(
      http.get("*/api/products/:slug", ({ params }) => {
        detailRequests.push(params.slug as string);
        return HttpResponse.json({
          data: {
            id: "p1",
            name: "iPhone 15 Pro Case",
            slug: "iphone-15-pro-case",
            price: "29.99",
            compareAtPrice: null,
            sku: "IP15-CASE",
            inStock: true,
            lowStock: false,
            ratingAverage: null,
            ratingCount: 0,
            variantSummary: { colors: [] },
          },
          category: null,
          group: null,
          images: [],
        });
      }),
    );
    registerRailHandlers();

    const user = userEvent.setup();
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([buildItem()]),
    });

    // Nothing is fetched until the trigger is actually clicked.
    expect(detailRequests).toHaveLength(0);
    await user.click(
      screen.getByRole("button", {
        name: dict.quickView.trigger("iPhone 15 Pro Case"),
      }),
    );

    // The dialog opens, titled from the item's name up front, and the body
    // hydrates from GET /api/products/:slug — proving both name and slug are
    // wired through from the wishlist item.
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "iPhone 15 Pro Case" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(detailRequests).toEqual(["iphone-15-pro-case"]));
  });
});

// ── TASK-415: the 1 / 2 / 4 card ladder ──────────────────────────────────────
// /wishlist renders the same kind of card as the catalog, so it follows the same
// explicit ladder: one card below 390px (two were unreadable on the smallest
// phones), two from 390px, four from `lg`. `WishlistSkeleton` must repeat both
// grids — the sidebar split and the card grid — byte for byte, or the page
// reflows the moment placeholders are swapped for real cards. Same pair of
// guards as in `product-list.test.tsx`.
describe("WishlistView grid ↔ skeleton parity (TASK-415)", () => {
  /** The card grid of a rendered `WishlistView` (the grid nearest a card). */
  function renderedCardGrid(): Element | null {
    return screen.getByRole("article").closest(".grid");
  }

  it("renders the grid one-up under 390px, two-up from 390px and four-up from lg", () => {
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([buildItem()]),
    });

    const grid = renderedCardGrid();
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

  it("lays the skeleton out in exactly the same columns as the real grid", () => {
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([buildItem()]),
    });
    const realGrid = renderedCardGrid();

    const { container } = renderWithProviders(<WishlistSkeleton />);
    // The skeleton has two grids (page split + cards); reach the card one the
    // same structural way as above — from a placeholder card outwards.
    const skeletonGrid = container
      .querySelector(".aspect-square")
      ?.closest(".grid");

    // Both sides must exist — otherwise the comparison below would pass
    // vacuously on two `undefined`s.
    expect(realGrid).not.toBeNull();
    expect(skeletonGrid).toHaveClass(
      "grid-cols-1",
      "min-[390px]:grid-cols-2",
      "lg:grid-cols-4",
    );
    // Byte-identical, not merely "both responsive": any drift here is a visible
    // reflow when the skeleton is replaced by cards.
    expect(skeletonGrid?.className).toBe(realGrid?.className);
  });

  it("repeats the sidebar + content split of the real page in the skeleton", () => {
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([buildItem()]),
    });
    const realShell = renderedCardGrid()?.parentElement?.closest(".grid");

    const { container } = renderWithProviders(<WishlistSkeleton />);
    const skeletonShell = container
      .querySelector(".aspect-square")
      ?.closest(".grid")
      ?.parentElement?.closest(".grid");

    expect(realShell).toBeTruthy();
    expect(skeletonShell).toBeTruthy();
    // The 268px filters column is what makes the content area narrower than the
    // viewport; if only one side declares it, the cards resize on hydration.
    expect(skeletonShell?.className).toBe(realShell?.className);
  });

  // TASK-869 — the header above the split: breadcrumb, then the title + toolbar
  // row. The skeleton used to draw one 32px bar instead, so the rail and the
  // grid started 68px (desktop) / 184px (phone) too high and jumped on load.
  it("repeats the header of the real page — breadcrumb row, then the title + toolbar row", () => {
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([buildItem()]),
    });
    const crumbs = screen.getByRole("navigation", {
      name: dict.product.breadcrumbAria,
    });
    const realRow = screen.getByRole("heading", { level: 1 }).parentElement
      ?.parentElement;

    const { container } = renderWithProviders(<WishlistSkeleton />);
    const header = container.firstElementChild?.firstElementChild;
    const [crumbSlot, row] = Array.from(header?.children ?? []);

    expect(header).toHaveAttribute("aria-hidden", "true");
    // Same bottom margin and line box as the breadcrumb (text-sm = 20px).
    expect(crumbSlot).toHaveClass("mb-4.5", "h-5");
    expect(crumbs).toHaveClass("mb-4.5", "text-sm");
    // The title + toolbar row wraps by the same rules.
    expect(row?.className).toBe(realRow?.className);
    // Title slot on the H1_CLASS line box (36px, 40px from md) + the count line.
    expect(row?.firstElementChild?.children[0]).toHaveClass("h-9", "md:h-10");
    expect(row?.firstElementChild?.children[1]).toHaveClass("h-5");
  });
});

// ── TASK-1300: /wishlist as «каталог №2» ─────────────────────────────────────
describe("WishlistView catalogue toolbar (TASK-1300)", () => {
  function twoBrands() {
    cardFacets = {
      a1: { categoryId: "cat-cases", brand: "Apple" },
      s1: { categoryId: "cat-cables", brand: "Spigen" },
    };
    return [
      buildItem({
        id: "a1",
        productId: "a1",
        productName: "Apple Case",
        productSlug: "apple-case",
      }),
      buildItem({
        id: "s1",
        productId: "s1",
        productName: "Spigen Cable",
        productSlug: "spigen-cable",
      }),
    ];
  }

  function savedItems(count: number) {
    return Array.from({ length: count }, (_, i) =>
      buildItem({
        id: `m${i}`,
        productId: `m${i}`,
        productName: `Saved ${i}`,
        productSlug: `saved-${i}`,
        // Distinct times so the default order is deterministic.
        createdAt: `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
  }

  it("filters by a brand from the rail, chips it and counts «Знайдено: X з Y»", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient(twoBrands()),
    });

    // The brand section appears once the product cards have landed.
    await user.click(await screen.findByRole("checkbox", { name: /Apple/ }));

    expect(screen.getByText("Apple Case")).toBeInTheDocument();
    expect(screen.queryByText("Spigen Cable")).not.toBeInTheDocument();
    expect(screen.getByText(dict.wishlist.foundOf(1, 2))).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: new RegExp(`${dict.filters.brandTitle}: Apple`),
      }),
    );
    expect(screen.getByText("Spigen Cable")).toBeInTheDocument();
  });

  it("filters by category, naming it from the category tree", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient(twoBrands()),
    });

    await user.click(await screen.findByRole("checkbox", { name: /Кабелі/ }));

    expect(screen.queryByText("Apple Case")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: new RegExp(dict.wishlist.categoryChip("Кабелі")),
      }),
    ).toBeInTheDocument();
  });

  it("sorts with the wishlist's own options in the shared SortSelect", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([
        buildItem({
          id: "c",
          productId: "c",
          productName: "Cheap",
          productSlug: "cheap",
          price: "10.00",
        }),
        buildItem({
          id: "d",
          productId: "d",
          productName: "Dear",
          productSlug: "dear",
          price: "90.00",
        }),
      ]),
    });

    const trigger = screen.getByRole("combobox", {
      name: dict.wishlist.sortAria,
    });
    expect(trigger).toHaveTextContent(dict.wishlist.sort.recent);

    await user.click(trigger);
    await user.click(
      screen.getByRole("option", { name: dict.wishlist.sort.priceDesc }),
    );

    const names = screen
      .getAllByRole("article")
      .map((card) => within(card).getAllByRole("link")[0].textContent);
    expect(names).toEqual(["Dear", "Cheap"]);
  });

  it("pages the list: «Показати ще» appends, numbered pages link through ?page=", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient(savedItems(13)),
    });

    expect(screen.getAllByRole("article")).toHaveLength(12);
    expect(screen.getByRole("link", { name: "2" })).toHaveAttribute(
      "href",
      "/wishlist?page=2",
    );

    await user.click(
      screen.getByRole("button", { name: dict.catalog.loadMore(1) }),
    );
    expect(screen.getAllByRole("article")).toHaveLength(13);
    expect(
      screen.queryByRole("button", { name: dict.catalog.loadMore(1) }),
    ).not.toBeInTheDocument();
  });

  it("returns to the first page when a filter changes on a later page", async () => {
    const user = userEvent.setup();
    currentQuery = "page=2";
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient(savedItems(13)),
    });

    // Page 2 of 13 items holds the single remaining card.
    expect(screen.getAllByRole("article")).toHaveLength(1);

    await user.click(screen.getByRole("checkbox", { name: /В наявності/ }));

    expect(mockReplace).toHaveBeenCalledWith("/wishlist", { scroll: false });
  });
});
