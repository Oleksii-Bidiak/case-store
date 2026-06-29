import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
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

    // Current position's pack value is "single" → active.
    expect(
      await screen.findByRole("button", { name: "single" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "double" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
