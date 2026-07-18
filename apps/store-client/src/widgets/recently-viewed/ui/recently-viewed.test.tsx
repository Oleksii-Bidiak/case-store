import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { RecentlyViewed } from "./recently-viewed";

const STORAGE_KEY = "case-store:recently-viewed";

function variantSummary(id: string, overrides: Record<string, unknown> = {}) {
  return {
    groupId: null,
    variantCount: 1,
    priceFrom: "12.99",
    defaultVariantId: id,
    defaultVariantSlug: `slug-${id}`,
    defaultInStock: true,
    colors: [],
    ...overrides,
  };
}

function makeProduct(
  id: string,
  name: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    name,
    slug: `slug-${id}`,
    description: "A nice product",
    price: "12.99",
    compareAtPrice: null,
    sku: `SKU-${id}`,
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
    variantSummary: variantSummary(id),
    ...overrides,
  };
}

function seedHistory(ids: string[]) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(ids.map((id) => ({ id, slug: `slug-${id}`, name: id }))),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  // Silence the wishlist bootstrap query fired by the injected card actions.
  server.use(
    http.get("*/api/wishlist", () =>
      HttpResponse.json({ data: { items: [] } }),
    ),
  );
});

describe("RecentlyViewed — fresh-card hydration rail (TASK-211)", () => {
  it("requests the stored ids and renders current ProductCards in history order", async () => {
    let requestedIds: string | null = null;
    server.use(
      http.get("*/api/products/cards", ({ request }) => {
        requestedIds = new URL(request.url).searchParams.get("ids");
        // Server order deliberately differs from history order.
        return HttpResponse.json({
          data: [
            makeProduct("p-1", "Product One", { price: "10.00" }),
            makeProduct("p-2", "Product Two", { price: "20.00" }),
          ],
        });
      }),
    );
    seedHistory(["p-2", "p-1"]);

    renderWithProviders(<RecentlyViewed />);

    expect(await screen.findByText("Product Two")).toBeInTheDocument();
    expect(requestedIds).toBe("p-2,p-1");

    // History (most-recent-first) dictates the rail order, not the response.
    const cardHeadings = screen.getAllByRole("heading", { level: 3 });
    expect(cardHeadings.map((h) => h.textContent)).toEqual([
      "Product Two",
      "Product One",
    ]);

    // The card composition is the shared ProductCard + ProductCardActions —
    // the injected quick-buy button proves the current card UI is in use.
    expect(
      screen.getByRole("button", {
        name: dict.productCard.buyAria("Product Two"),
      }),
    ).toBeEnabled();
  });

  it("renders nothing when there is no history", () => {
    renderWithProviders(<RecentlyViewed />);

    expect(
      screen.queryByRole("heading", {
        name: dict.home.recentlyViewed.heading,
      }),
    ).not.toBeInTheDocument();
  });

  it("silently drops ids the server no longer returns (stale history self-heals)", async () => {
    server.use(
      http.get("*/api/products/cards", () =>
        HttpResponse.json({ data: [makeProduct("p-1", "Product One")] }),
      ),
    );
    seedHistory(["p-deleted", "p-1"]);

    renderWithProviders(<RecentlyViewed />);

    expect(await screen.findByText("Product One")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
  });

  it("clears the history and hides the section via the clear button", async () => {
    server.use(
      http.get("*/api/products/cards", () =>
        HttpResponse.json({ data: [makeProduct("p-1", "Product One")] }),
      ),
    );
    seedHistory(["p-1"]);

    renderWithProviders(<RecentlyViewed />);
    await screen.findByText("Product One");

    await userEvent.click(
      screen.getByRole("button", { name: dict.home.recentlyViewed.clear }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", {
          name: dict.home.recentlyViewed.heading,
        }),
      ).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("hydrates legacy full-snapshot entries by id as well", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "p-legacy",
          name: "Old Name (stale)",
          slug: "old-slug",
          price: "1.00",
          imageUrl: null,
        },
      ]),
    );
    server.use(
      http.get("*/api/products/cards", () =>
        HttpResponse.json({
          data: [makeProduct("p-legacy", "Fresh Name", { price: "42.00" })],
        }),
      ),
    );

    renderWithProviders(<RecentlyViewed />);

    // The card shows the FRESH server data, not the stored stale snapshot.
    expect(await screen.findByText("Fresh Name")).toBeInTheDocument();
    expect(screen.queryByText("Old Name (stale)")).not.toBeInTheDocument();
  });

  it("shows the rail error message when hydration fails", async () => {
    server.use(
      http.get("*/api/products/cards", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    seedHistory(["p-1"]);

    renderWithProviders(<RecentlyViewed />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.home.recentlyViewed.error,
    );
  });
});
