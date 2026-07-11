import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { PublicCarouselEntity } from "@/shared/api/generated/models";
import { RecommendationCarousels } from "./recommendation-carousels";
import { CarouselRail } from "./carousel-rail";

beforeEach(() => {
  // Silence the wishlist bootstrap query fired by the injected card actions
  // (mirrors the RecentlyViewed test setup).
  server.use(
    http.get("*/api/wishlist", () =>
      HttpResponse.json({ data: { items: [] } }),
    ),
  );
});

function variantSummary(overrides: Record<string, unknown> = {}) {
  return {
    groupId: null,
    variantCount: 1,
    priceFrom: "12.99",
    defaultVariantId: "product-1",
    defaultVariantSlug: "tempered-glass",
    defaultInStock: true,
    colors: [],
    ...overrides,
  };
}

function makeProduct(id: string, name: string) {
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
    variantSummary: variantSummary({
      defaultVariantId: id,
      defaultVariantSlug: `slug-${id}`,
    }),
  };
}

function makeCarousel(
  id: string,
  title: string,
  products: ReturnType<typeof makeProduct>[],
): PublicCarouselEntity {
  return {
    id,
    title,
    source: "BESTSELLING",
    sortOrder: 0,
    products,
  } as unknown as PublicCarouselEntity;
}

describe("RecommendationCarousels", () => {
  it("renders nothing for an empty carousels array", () => {
    const { container } = renderWithProviders(
      <RecommendationCarousels carousels={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when every carousel resolved to zero products", () => {
    const { container } = renderWithProviders(
      <RecommendationCarousels
        carousels={[makeCarousel("c1", "Порожня", [])]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders only the non-empty carousels from a mixed list", () => {
    renderWithProviders(
      <RecommendationCarousels
        carousels={[
          makeCarousel("c1", "Хіти тижня", [makeProduct("p1", "Чохол Alpha")]),
          makeCarousel("c2", "Порожня секція", []),
          makeCarousel("c3", "Редакція обирає", [
            makeProduct("p2", "Скло Beta"),
          ]),
        ]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Хіти тижня" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Редакція обирає" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Порожня секція")).not.toBeInTheDocument();
    expect(screen.getByText("Чохол Alpha")).toBeInTheDocument();
    expect(screen.getByText("Скло Beta")).toBeInTheDocument();
  });
});

describe("CarouselRail", () => {
  it("renders the admin-authored heading and every product card", () => {
    renderWithProviders(
      <CarouselRail
        carousel={makeCarousel("c1", "Хіти тижня", [
          makeProduct("p1", "Чохол Alpha"),
          makeProduct("p2", "Скло Beta"),
        ])}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Хіти тижня" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Чохол Alpha")).toBeInTheDocument();
    expect(screen.getByText("Скло Beta")).toBeInTheDocument();
  });

  it("scroll arrows are present and clicking them does not crash", async () => {
    // jsdom implements no scrolling — stub scrollBy so the arrow handler runs.
    Element.prototype.scrollBy =
      Element.prototype.scrollBy ?? (jest.fn() as never);

    renderWithProviders(
      <CarouselRail
        carousel={makeCarousel("c1", "Хіти тижня", [
          makeProduct("p1", "Чохол Alpha"),
        ])}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: dict.carousels.prevAria }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.carousels.nextAria }),
    );

    expect(screen.getByText("Чохол Alpha")).toBeInTheDocument();
  });

  it("does not crash on a single-item carousel", () => {
    renderWithProviders(
      <CarouselRail
        carousel={makeCarousel("c1", "Один товар", [
          makeProduct("p1", "Чохол Alpha"),
        ])}
      />,
    );

    expect(screen.getByText("Чохол Alpha")).toBeInTheDocument();
  });
});
