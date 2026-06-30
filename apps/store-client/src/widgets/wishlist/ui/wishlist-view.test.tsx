import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders, screen, within } from "@/shared/test/render";
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
    stock: 10,
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
});
