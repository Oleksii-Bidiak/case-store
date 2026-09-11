import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeCart, makeCartItem } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import { ProductDetailView } from "./product-detail-view";

// next/navigation is unavailable under jsdom — the sibling navigator routes off
// the mocked push.
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/products/glass-blue-single",
}));

const baseProduct = {
  id: "product-1",
  name: "Tempered Glass — Blue Single",
  slug: "glass-blue-single",
  description: "A nice product",
  price: "12.99",
  compareAtPrice: "19.99",
  sku: "TG-BLUE-1",
  inStock: true,
  lowStock: false,
  categoryId: "cat-1",
  groupId: "g1",
  attributes: { color: "blue", pack: "single" },
  positionOrder: 0,
  isActive: true,
  ratingAverage: 0,
  ratingCount: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  primaryImage: null,
  specs: [],
  highlights: [],
};

/** Detail envelope for a position that belongs to a two-position group. */
function detailEnvelope() {
  return {
    data: baseProduct,
    category: { id: "cat-1", name: "Cases", slug: "cases" },
    group: {
      id: "g1",
      name: "Tempered Glass",
      axes: [{ name: "pack", sortOrder: 0 }],
      positions: [
        {
          id: "product-1",
          slug: "glass-blue-single",
          name: "Tempered Glass — Blue Single",
          price: "12.99",
          attributes: { color: "blue", pack: "single" },
          stock: 7,
          isActive: true,
          positionOrder: 0,
        },
        {
          id: "product-2",
          slug: "glass-blue-double",
          name: "Tempered Glass — Blue Double",
          price: "19.99",
          attributes: { color: "blue", pack: "double" },
          stock: 3,
          isActive: true,
          positionOrder: 1,
        },
      ],
    },
    images: [],
  };
}

describe("ProductDetailView — position model (TASK-142)", () => {
  beforeEach(() => {
    mockPush.mockClear();
    server.use(
      http.get("*/api/products/:slug", () =>
        HttpResponse.json(detailEnvelope()),
      ),
      // ProductRelated fires a list query; return an empty page.
      http.get("*/api/products", () =>
        HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, limit: 5, totalPages: 0 },
        }),
      ),
    );
  });

  it("shows the position's own price and sku directly", async () => {
    renderWithProviders(<ProductDetailView slug="glass-blue-single" />);

    expect(
      await screen.findByRole("heading", {
        name: "Tempered Glass — Blue Single",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/TG-BLUE-1/)).toBeInTheDocument();
  });

  it("renders the sibling navigator with the current value active", async () => {
    renderWithProviders(<ProductDetailView slug="glass-blue-single" />);

    await screen.findByRole("heading", {
      name: "Tempered Glass — Blue Single",
    });

    // Current position's pack value is "single" → active, and a button (there
    // is nowhere to go). The reachable sibling is a link since TASK-409.
    expect(
      await screen.findByRole("button", { name: "single" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "double" })).toHaveAttribute(
      "href",
      "/products/glass-blue-double",
    );
  });

  // TASK-261 — view_product analytics event.
  it("reports view_product once with the slug and does not re-fire on re-render", async () => {
    const track = jest.fn();
    window.umami = { track };

    const { rerender } = renderWithProviders(
      <ProductDetailView slug="glass-blue-single" />,
    );
    await screen.findByRole("heading", {
      name: "Tempered Glass — Blue Single",
    });

    await waitFor(() =>
      expect(track).toHaveBeenCalledWith("view_product", {
        slug: "glass-blue-single",
      }),
    );

    // An unrelated re-render (same position id) must not re-fire the effect.
    rerender(<ProductDetailView slug="glass-blue-single" />);
    expect(
      track.mock.calls.filter(([name]) => name === "view_product"),
    ).toHaveLength(1);

    delete window.umami;
  });
});

/**
 * TASK-409 — the buy box reads the CART, not the add mutation.
 *
 * The old button wore the mutation's `isSuccess`, which never clears: one click
 * and it read «Додано ✓» for the rest of the page's life, whatever happened to
 * the cart afterwards. The three states below are all derived from `GET /api/cart`,
 * so they survive a reload and clear when the line is removed.
 */
describe("ProductDetailView — buy box in-cart state (TASK-409)", () => {
  const arrange = (
    product: Partial<typeof baseProduct>,
    items: ReturnType<typeof makeCartItem>[],
  ) => {
    server.use(
      http.get("*/api/products/:slug", () =>
        HttpResponse.json({
          ...detailEnvelope(),
          data: { ...baseProduct, ...product },
        }),
      ),
      http.get("*/api/products", () =>
        HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, limit: 5, totalPages: 0 },
        }),
      ),
      http.get("*/api/cart", () => HttpResponse.json(makeCart(items))),
    );
    renderWithProviders(<ProductDetailView slug="glass-blue-single" />);
  };

  it("offers «Додати до кошика» while the position is not in the cart", async () => {
    arrange({}, []);

    expect(
      await screen.findByRole("button", { name: dict.addToCart.idle }),
    ).toBeEnabled();
    expect(screen.queryByText(dict.addToCart.inCart)).toBeNull();
  });

  it("shows «В кошику» when the cart already holds this position", async () => {
    arrange({}, [makeCartItem({ productId: "product-1" })]);

    expect(
      await screen.findByRole("button", {
        name: dict.addToCart.inCartAria("Tempered Glass — Blue Single"),
      }),
    ).toBeInTheDocument();
    // The add button is gone — the shopper manages the line in the cart now.
    expect(
      screen.queryByRole("button", { name: dict.addToCart.idle }),
    ).toBeNull();
  });

  it("warns «Товар закінчився» when the position is in the cart but sold out", async () => {
    arrange({ inStock: false }, [makeCartItem({ productId: "product-1" })]);

    const button = await screen.findByRole("button", {
      name: dict.addToCart.soldOutAria("Tempered Glass — Blue Single"),
    });
    expect(button).toHaveTextContent(dict.addToCart.soldOut);
  });

  it("never leaves the add button stuck on «Додано ✓» after a successful add", async () => {
    const user = userEvent.setup();
    arrange({}, []);

    const button = await screen.findByRole("button", {
      name: dict.addToCart.idle,
    });
    await user.click(button);

    // The success signal is the toast; the button returns to its idle label
    // (and flips to «В кошику» only once the cart query says so).
    await waitFor(() =>
      expect(screen.queryByText(dict.addToCart.added)).toBeNull(),
    );
    expect(
      screen.getByRole("button", { name: dict.addToCart.idle }),
    ).toBeInTheDocument();
  });
});
