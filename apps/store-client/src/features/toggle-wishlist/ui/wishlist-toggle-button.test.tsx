import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders, screen } from "@/shared/test/render";
import { getGetWishlistQueryKey } from "@/entities/wishlist";
import { dict } from "@/shared/config";
import { WishlistToggleButton } from "./wishlist-toggle-button";

/**
 * Seed a wishlist query result so the toggle derives its saved state from the
 * cache without hitting the network. staleTime Infinity keeps the seeded data
 * from triggering a background refetch in jsdom.
 */
function seededClient(productIds: string[]): QueryClient {
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
      items: productIds.map((productId) => ({
        id: `i-${productId}`,
        productId,
      })),
      itemCount: productIds.length,
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    },
  });
  return client;
}

describe("WishlistToggleButton (TASK-076)", () => {
  it("renders aria-pressed=false with the 'add' label when the product is not saved", () => {
    renderWithProviders(
      <WishlistToggleButton productId="p1" productName="iPhone Case" />,
      { queryClient: seededClient([]) },
    );

    const button = screen.getByRole("button", {
      name: dict.productCard.wishlistAddAria("iPhone Case"),
    });
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("renders aria-pressed=true with the 'remove' label when the product is saved", () => {
    renderWithProviders(
      <WishlistToggleButton productId="p1" productName="iPhone Case" />,
      { queryClient: seededClient(["p1"]) },
    );

    const button = screen.getByRole("button", {
      name: dict.productCard.wishlistRemoveAria("iPhone Case"),
    });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("gives the overlay variant a 44px (size-11) hit-area (TASK-259-H)", () => {
    renderWithProviders(
      <WishlistToggleButton
        productId="p1"
        productName="iPhone Case"
        variant="overlay"
      />,
      { queryClient: seededClient([]) },
    );

    const button = screen.getByRole("button", {
      name: dict.productCard.wishlistAddAria("iPhone Case"),
    });
    expect(button).toHaveClass("size-11");
  });
});
