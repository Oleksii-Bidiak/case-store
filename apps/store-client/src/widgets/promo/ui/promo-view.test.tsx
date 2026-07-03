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
      http.get("*/api/products", () =>
        HttpResponse.json({
          data: [
            makeProduct({
              id: "p-sale",
              name: "Знижений товар",
              slug: "deal-1",
              price: "100.00",
              compareAtPrice: "150.00",
            }),
            makeProduct({
              id: "p-full",
              name: "Повна ціна",
              slug: "full-1",
              compareAtPrice: null,
            }),
          ],
          meta: { total: 2, page: 1, limit: 48, totalPages: 1 },
        }),
      ),
    );
  });

  it("renders the hero, coupon codes and the countdown", () => {
    renderWithProviders(<PromoView />);

    expect(
      screen.getByRole("heading", { level: 1, name: d.hero.heading }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: d.couponsHeading }),
    ).toBeInTheDocument();
    expect(screen.getByText("MOBILE5")).toBeInTheDocument();
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

  it("confirms the newsletter subscribe stub locally", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PromoView />);

    await user.type(
      screen.getByRole("textbox", { name: d.newsletter.emailAria }),
      "shopper@example.com",
    );
    await user.click(screen.getByRole("button", { name: d.newsletter.submit }));

    expect(
      screen.getByRole("button", { name: d.newsletter.submitted }),
    ).toBeInTheDocument();
  });
});
