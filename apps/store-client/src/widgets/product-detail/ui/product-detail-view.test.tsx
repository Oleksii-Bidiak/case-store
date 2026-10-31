import { http, HttpResponse } from "msw";
import { QueryClient } from "@tanstack/react-query";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeCart, makeCartItem } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import { ProductDetailView } from "./product-detail-view";
import { ProductDetailSkeleton } from "./product-detail-skeleton";

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
      // The «Схожі товари» ProductRail fires a list query; return an empty page.
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

  // The buy box and the mobile bar (TASK-874) both carry the in-cart control,
  // so these assertions count two of them; the bar has its own block below.
  it("shows «В кошику» when the cart already holds this position", async () => {
    arrange({}, [makeCartItem({ productId: "product-1" })]);

    expect(
      await screen.findAllByRole("button", {
        name: dict.addToCart.inCartAria("Tempered Glass — Blue Single"),
      }),
    ).toHaveLength(2);
    // The add button is gone — the shopper manages the line in the cart now.
    expect(
      screen.queryByRole("button", { name: dict.addToCart.idle }),
    ).toBeNull();
  });

  it("warns «Товар закінчився» when the position is in the cart but sold out", async () => {
    arrange({ inStock: false }, [makeCartItem({ productId: "product-1" })]);

    const buttons = await screen.findAllByRole("button", {
      name: dict.addToCart.soldOutAria("Tempered Glass — Blue Single"),
    });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toHaveTextContent(dict.addToCart.soldOut);
    }
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

/**
 * TASK-874 — the sticky mobile bar reads the same cart answer as the buy box.
 * It used to offer «Купити» for a position already in the cart, so the two
 * CTAs on one phone screen contradicted each other.
 */
describe("ProductDetailView — mobile bar cart state and sale badge (TASK-874)", () => {
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

  it("offers «Купити» in the bar while the position is not in the cart", async () => {
    arrange({}, []);
    await screen.findByRole("heading", { level: 1 });

    const bar = screen.getByTestId("mobile-atc-bar");
    expect(
      within(bar).getByRole("button", { name: dict.addToCart.buy }),
    ).toBeEnabled();
    expect(within(bar).queryByText(dict.addToCart.inCart)).toBeNull();
  });

  it("swaps the bar's «Купити» for «В кошику» once the cart holds the position", async () => {
    arrange({}, [makeCartItem({ productId: "product-1" })]);

    const bar = await screen.findByTestId("mobile-atc-bar");
    const inCart = await within(bar).findByRole("button", {
      name: dict.addToCart.inCartAria("Tempered Glass — Blue Single"),
    });
    expect(inCart).toHaveTextContent(dict.addToCart.inCart);
    expect(
      within(bar).queryByRole("button", { name: dict.addToCart.buy }),
    ).toBeNull();
  });

  it("opens the mini-cart from the bar's «В кошику», like the buy box", async () => {
    const user = userEvent.setup();
    arrange({}, [makeCartItem({ productId: "product-1" })]);

    const bar = await screen.findByTestId("mobile-atc-bar");
    await user.click(
      await within(bar).findByRole("button", {
        name: dict.addToCart.inCartAria("Tempered Glass — Blue Single"),
      }),
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("warns «Товар закінчився» in the bar for a sold-out position in the cart", async () => {
    arrange({ inStock: false }, [makeCartItem({ productId: "product-1" })]);

    const bar = await screen.findByTestId("mobile-atc-bar");
    expect(
      await within(bar).findByRole("button", {
        name: dict.addToCart.soldOutAria("Tempered Glass — Blue Single"),
      }),
    ).toHaveTextContent(dict.addToCart.soldOut);
  });

  it("renders the discount as the shared sale Badge", async () => {
    // 12.99 against 19.99 → −35%.
    arrange({}, []);
    await screen.findByRole("heading", { level: 1 });

    const badge = screen.getByText("−35%");
    expect(badge).toHaveAttribute("data-slot", "badge");
    expect(badge).toHaveAttribute("data-variant", "sale");
    // The PDP chip keeps the badge radius, not the Badge's default pill.
    expect(badge).toHaveClass("rounded-sm");
    expect(badge).not.toHaveClass("rounded-full");
  });

  it("shows no discount badge when there is no old price", async () => {
    arrange({ compareAtPrice: null as unknown as string }, []);
    await screen.findByRole("heading", { level: 1 });

    expect(screen.queryByText(/^−\d+%$/)).toBeNull();
  });
});

/**
 * TASK-416 — the PDP hero folds into TWO columns at 768px instead of waiting
 * for 1024px: gallery over info in the fluid left column, the 360px buy-box
 * rail beside them. On a tablet the price and the CTA used to sit a full
 * screen-height below the photo. The skeleton declares the identical grid, or
 * the page reflows the moment the real view hydrates.
 */
describe("ProductDetailView — responsive hero grid (TASK-416)", () => {
  const arrange = () => {
    server.use(
      http.get("*/api/products/:slug", () =>
        HttpResponse.json(detailEnvelope()),
      ),
      http.get("*/api/products", () =>
        HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, limit: 5, totalPages: 0 },
        }),
      ),
      http.get("*/api/cart", () => HttpResponse.json(makeCart([]))),
    );
    return renderWithProviders(<ProductDetailView slug="glass-blue-single" />);
  };

  it("stacks below lg and splits into two equal halves from lg, the gallery sticky (Д3-2 §6.1)", async () => {
    const { container } = arrange();
    await screen.findByRole("heading", { level: 1 });

    const hero = container.querySelector(".grid");
    expect(hero).toHaveClass("grid-cols-1", "lg:grid-cols-2", "lg:items-start");
    expect(hero?.children).toHaveLength(2);
    // TASK-519: the shared header offset, not a hand-written `lg:top-24`.
    expect(hero?.firstElementChild).toHaveClass(
      "lg:sticky",
      "top-(--sticky-header-offset)",
    );

    // One info column carries the price and the buy row — no separate box.
    const info = hero?.lastElementChild as HTMLElement;
    expect(within(info).getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(
      within(info).getByRole("button", { name: dict.addToCart.idle }),
    ).toBeInTheDocument();
  });

  it("hides the mobile buy bar from lg, not md", async () => {
    arrange();
    await screen.findByRole("heading", { level: 1 });
    const bar = screen.getByTestId("mobile-atc-bar");
    expect(bar).toHaveClass("lg:hidden", "bg-card/94");
    expect(bar).not.toHaveClass("md:hidden");
  });

  it("gives the skeleton the identical hero grid", async () => {
    const { container } = arrange();
    await screen.findByRole("heading", { level: 1 });
    const hero = container.querySelector(".grid");

    const { container: skeleton } = renderWithProviders(
      <ProductDetailSkeleton />,
    );

    // Byte-identical, not merely "both responsive".
    expect(skeleton.querySelector(".grid")?.className).toBe(hero?.className);
  });
});

/**
 * TASK-832 — the gallery's zoom trigger is a transparent `z-20` button over the
 * whole frame. «В обране» must paint above it (the mockup's note: heart `z-30`)
 * or a tap on the heart opens the lightbox. jsdom has no hit-testing, so the
 * stacking contract is pinned by class.
 */
describe("ProductDetailView — gallery overlays (TASK-832)", () => {
  beforeEach(() => {
    const envelope = detailEnvelope();
    server.use(
      http.get("*/api/products/:slug", () =>
        HttpResponse.json({
          ...envelope,
          images: [
            {
              id: "img-1",
              productId: "product-1",
              url: "https://example.com/a.jpg",
              alt: "Photo a",
              sortOrder: 0,
            },
          ],
        }),
      ),
      http.get("*/api/products", () =>
        HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, limit: 5, totalPages: 0 },
        }),
      ),
      http.get("*/api/cart", () => HttpResponse.json(makeCart([]))),
    );
  });

  it("keeps the gallery free for the zoom trigger — the heart sits in the buy row (Д3-2 §6.1)", async () => {
    const { container } = renderWithProviders(
      <ProductDetailView slug="glass-blue-single" />,
    );
    await screen.findByRole("heading", { level: 1 });

    const zoom = screen.getByRole("button", { name: dict.product.zoomAria });
    expect(zoom).toHaveClass("absolute", "inset-0", "z-20");

    // Exactly one heart, and not over the photo (TASK-832's tap conflict
    // cannot come back): a 56px pill beside the CTA.
    const heart = screen.getByRole("button", {
      name: dict.productCard.wishlistAddAria(baseProduct.name),
    });
    const gallery = container.querySelector(".grid")?.firstElementChild;
    expect(gallery?.contains(heart)).toBe(false);
    expect(heart).toHaveClass("size-14");
  });
});

/**
 * TASK-832 — the skeleton draws the buy box a shopper actually gets: the
 * compare square and the «Купити в 1 клік» bar are parked stubs behind
 * `FEATURE_STUBS` (off), so the skeleton must not promise them.
 */
describe("ProductDetailSkeleton — buy box (TASK-832)", () => {
  it("draws one full-width CTA and no placeholders for the parked stubs", () => {
    renderWithProviders(<ProductDetailSkeleton />);

    const buyBox = screen.getByTestId("product-detail-skeleton-buy-box");
    // One 56px CTA and the heart — the old skeleton drew a second bar for
    // the «Купити в 1 клік» stub and a square for «Порівняти».
    expect(buyBox.querySelectorAll(".h-14.w-full")).toHaveLength(1);
    expect(buyBox.children).toHaveLength(2);
    expect(screen.getByTestId("product-detail-skeleton-cta")).toHaveClass(
      "w-full",
    );
  });

  it("uses the view's sticky gallery and services-card chrome", async () => {
    server.use(
      http.get("*/api/products/:slug", () =>
        HttpResponse.json(detailEnvelope()),
      ),
      http.get("*/api/products", () =>
        HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, limit: 5, totalPages: 0 },
        }),
      ),
      http.get("*/api/cart", () => HttpResponse.json(makeCart([]))),
    );
    const { container } = renderWithProviders(
      <ProductDetailView slug="glass-blue-single" />,
    );
    await screen.findByRole("heading", { level: 1 });
    const viewGallery = container.querySelector(".grid")?.firstElementChild;
    const viewServices = container.querySelector(
      '[data-slot="product-services"]',
    );

    const { container: skeleton } = renderWithProviders(
      <ProductDetailSkeleton />,
    );
    const skeletonGallery = skeleton.querySelector(".grid")?.firstElementChild;

    expect(skeletonGallery?.className).toBe(viewGallery?.className);
    // The services card's chrome is the last block of both info columns.
    expect(
      skeleton.querySelector(".grid")?.lastElementChild?.lastElementChild
        ?.className,
    ).toBe(viewServices?.className);
  });
});

// TASK-669 — under a signed preview the server seeds a product the browser
// cannot re-read (its own request carries no token: the token lives in an
// httpOnly cookie), so a background refetch would trade the draft for a 404.
describe("ProductDetailView — signed preview keeps the seeded draft (TASK-669)", () => {
  let detailReads = 0;

  beforeEach(() => {
    detailReads = 0;
    server.use(
      http.get("*/api/products/:slug", () => {
        detailReads += 1;
        return HttpResponse.json({ statusCode: 404 }, { status: 404 });
      }),
      http.get("*/api/products", () =>
        HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, limit: 5, totalPages: 0 },
        }),
      ),
      http.get("*/api/cart", () => HttpResponse.json(makeCart([]))),
    );
  });

  function seededClient(): QueryClient {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // An old seed: stale under every default, as a long-open preview tab is.
    client.setQueryData(["/api/products/glass-blue-single"], detailEnvelope(), {
      updatedAt: 1,
    });
    return client;
  }

  it("does not refetch the seed in preview, so the draft stays on screen", async () => {
    renderWithProviders(
      <ProductDetailView slug="glass-blue-single" preview />,
      { queryClient: seededClient() },
    );

    expect(
      await screen.findByRole("heading", {
        name: "Tempered Glass — Blue Single",
      }),
    ).toBeInTheDocument();
    // Give a mount refetch every chance to happen.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(detailReads).toBe(0);
  });

  it("outside a preview still revalidates a stale seed, as before", async () => {
    renderWithProviders(<ProductDetailView slug="glass-blue-single" />, {
      queryClient: seededClient(),
    });

    await waitFor(() => expect(detailReads).toBe(1));
  });
});
