import { QueryClient } from "@tanstack/react-query";
import {
  renderWithProviders,
  screen,
  within,
  userEvent,
} from "@/shared/test/render";
import {
  getGetWishlistQueryKey,
  type WishlistItemEntity,
} from "@/entities/wishlist";
import { dict } from "@/shared/config";
import { WishlistView } from "./wishlist-view";

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
