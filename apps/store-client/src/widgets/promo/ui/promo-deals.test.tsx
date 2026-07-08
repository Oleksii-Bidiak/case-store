import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { PromoDeals } from "./promo-deals";

function variantSummary(overrides: Record<string, unknown> = {}) {
  return {
    groupId: null,
    variantCount: 1,
    priceFrom: "100.00",
    defaultVariantId: "p1",
    defaultVariantSlug: "deal-1",
    defaultInStock: true,
    colors: [],
    ...overrides,
  };
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "Знижка 1",
    slug: "deal-1",
    description: "A nice product",
    price: "100.00",
    compareAtPrice: "150.00",
    sku: "TG-1",
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
    variantSummary: variantSummary(),
    ...overrides,
  };
}

const d = dict.promo;

describe("PromoDeals", () => {
  let productRequests: URL[];

  beforeEach(() => {
    productRequests = [];
    server.use(
      http.get("*/api/categories", () =>
        HttpResponse.json({
          data: [
            {
              id: "cat-1",
              name: "Смартфони",
              slug: "smartphones",
              parentId: null,
              isActive: true,
              sortOrder: 0,
              createdAt: "2026-06-01T00:00:00.000Z",
              updatedAt: "2026-06-01T00:00:00.000Z",
            },
          ],
        }),
      ),
      http.get("*/api/products", ({ request }) => {
        const url = new URL(request.url);
        productRequests.push(url);
        const page = Number(url.searchParams.get("page") ?? "1");
        const categoryId = url.searchParams.get("categoryId");

        // A category tab returns its own single-page product set (used to prove
        // pagination resets on a category change).
        if (categoryId) {
          return HttpResponse.json({
            data: [makeProduct({ id: "c1", name: "Категорійна знижка" })],
            meta: { total: 1, page: 1, limit: 1, totalPages: 1 },
          });
        }

        // "Усі": a two-page set so «Показати ще» appears (total 2, limit 1).
        const data =
          page === 2
            ? [makeProduct({ id: "p2", name: "Знижка 2" })]
            : [makeProduct({ id: "p1", name: "Знижка 1" })];
        return HttpResponse.json({
          data,
          meta: { total: 2, page, limit: 1, totalPages: 2 },
        });
      }),
    );
  });

  it("requests the server-side onSale filter", async () => {
    renderWithProviders(<PromoDeals />);

    expect(await screen.findByText("Знижка 1")).toBeInTheDocument();
    expect(
      productRequests.some((url) => url.searchParams.get("onSale") === "true"),
    ).toBe(true);
  });

  it("appends the next page via «Показати ще» and merges without duplicates", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PromoDeals />);

    expect(await screen.findByText("Знижка 1")).toBeInTheDocument();

    await user.click(
      await screen.findByRole("button", { name: /Показати ще/ }),
    );

    // Second page appended; first page still present, no duplicate cards.
    expect(await screen.findByText("Знижка 2")).toBeInTheDocument();
    expect(screen.getAllByText("Знижка 1")).toHaveLength(1);
  });

  it("resets pagination to page 1 when the category tab changes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PromoDeals />);

    // Load the second page under "Усі".
    await user.click(
      await screen.findByRole("button", { name: /Показати ще/ }),
    );
    expect(await screen.findByText("Знижка 2")).toBeInTheDocument();

    // Switch to the "Смартфони" category tab.
    await user.click(await screen.findByRole("button", { name: "Смартфони" }));

    // The category set renders and the previously-appended page-2 card is gone.
    expect(await screen.findByText("Категорійна знижка")).toBeInTheDocument();
    expect(screen.queryByText("Знижка 2")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no on-sale products", async () => {
    server.use(
      http.get("*/api/products", () =>
        HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, limit: 12, totalPages: 0 },
        }),
      ),
    );
    renderWithProviders(<PromoDeals />);

    expect(await screen.findByText(d.dealsEmpty)).toBeInTheDocument();
  });
});
