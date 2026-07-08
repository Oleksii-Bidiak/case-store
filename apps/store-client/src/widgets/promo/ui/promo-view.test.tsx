import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { PromoView } from "./promo-view";

function variantSummary(overrides: Record<string, unknown> = {}) {
  return {
    groupId: null,
    variantCount: 1,
    priceFrom: "100.00",
    defaultVariantId: "p-sale",
    defaultVariantSlug: "deal-1",
    defaultInStock: true,
    colors: [],
    ...overrides,
  };
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "p-sale",
    name: "Tempered Glass",
    slug: "deal-1",
    description: "A nice product",
    price: "100.00",
    compareAtPrice: null,
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

describe("PromoView", () => {
  beforeEach(() => {
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
      // The on-sale grid now relies on SERVER-side filtering (TASK-179): the
      // handler must branch on the `onSale` query param, otherwise the
      // "only on-sale products" test would pass vacuously.
      http.get("*/api/products", ({ request }) => {
        const onSale = new URL(request.url).searchParams.get("onSale");
        const saleProduct = makeProduct({
          id: "p-sale",
          name: "Знижений товар",
          slug: "deal-1",
          price: "100.00",
          compareAtPrice: "150.00",
        });
        const fullProduct = makeProduct({
          id: "p-full",
          name: "Повна ціна",
          slug: "full-1",
          compareAtPrice: null,
        });
        const data =
          onSale === "true" ? [saleProduct] : [saleProduct, fullProduct];
        return HttpResponse.json({
          data,
          meta: { total: data.length, page: 1, limit: 12, totalPages: 1 },
        });
      }),
      http.get("*/api/discounts/active", () =>
        HttpResponse.json({
          data: [
            {
              code: "SUMMER10",
              type: "PERCENT",
              value: "10",
              minSpend: "500.00",
              expiresAt: null,
            },
          ],
        }),
      ),
    );
  });

  it("renders the hero, coupon codes and the countdown", async () => {
    renderWithProviders(<PromoView />);

    expect(
      screen.getByRole("heading", { level: 1, name: d.hero.heading }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: d.couponsHeading }),
    ).toBeInTheDocument();
    // The coupon code comes from the live active-discounts feed (TASK-179).
    expect(await screen.findByText("SUMMER10")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("shows only on-sale products in the deals grid", async () => {
    renderWithProviders(<PromoView />);

    // The discounted product renders; the full-price one is filtered out.
    expect(await screen.findByText("Знижений товар")).toBeInTheDocument();
    expect(screen.queryByText("Повна ціна")).not.toBeInTheDocument();
  });

  it("renders the real root categories as filter tabs", async () => {
    renderWithProviders(<PromoView />);

    expect(
      await screen.findByRole("button", { name: "Смартфони" }),
    ).toBeInTheDocument();
    // "Усі" is the default-selected tab.
    expect(screen.getByRole("button", { name: d.dealsAll })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("subscribes to the newsletter and shows the success message", async () => {
    server.use(
      http.post("*/api/newsletter/subscribe", () =>
        HttpResponse.json({ data: { subscribed: true } }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<PromoView />);

    await user.type(
      screen.getByRole("textbox", { name: dict.newsletterForm.emailLabel }),
      "shopper@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: dict.newsletterForm.submit }),
    );

    expect(
      await screen.findByText(dict.newsletterForm.success),
    ).toBeInTheDocument();
  });
});
