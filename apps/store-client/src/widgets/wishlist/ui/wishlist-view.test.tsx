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
});
