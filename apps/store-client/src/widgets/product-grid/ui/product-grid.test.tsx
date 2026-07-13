import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { PublicCarouselEntity } from "@/shared/api/generated/models";
import { PopularRail } from "./product-grid";

beforeEach(() => {
  // Silence the wishlist bootstrap query fired by the injected card actions
  // (mirrors the RecommendationCarousels test setup).
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

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "product-1",
    name: "Tempered Glass",
    slug: "tempered-glass",
    description: "A nice product",
    price: "12.99",
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

function listEnvelope(products: ReturnType<typeof makeProduct>[]) {
  return {
    data: products,
    meta: { total: products.length, page: 1, limit: 8, totalPages: 1 },
  };
}

/** A published HOME_TABS carousel with its products already resolved by the API. */
function makeTabCarousel(
  id: string,
  title: string,
  products: ReturnType<typeof makeProduct>[],
): PublicCarouselEntity {
  return {
    id,
    title,
    source: "BESTSELLING",
    placement: "HOME_TABS",
    sortOrder: 0,
    products,
  } as unknown as PublicCarouselEntity;
}

describe("PopularRail — admin-managed tabs (TASK-288)", () => {
  it("builds the tabs from the HOME_TABS carousels (title = label) and renders the first one's products", async () => {
    renderWithProviders(
      <PopularRail
        carousels={[
          makeTabCarousel("c1", "Хіти тижня", [
            makeProduct({ id: "p1", name: "Чохол Alpha" }),
          ]),
          makeTabCarousel("c2", "Редакція обирає", [
            makeProduct({ id: "p2", name: "Скло Beta" }),
          ]),
        ]}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Хіти тижня",
      "Редакція обирає",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Чохол Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Скло Beta")).not.toBeInTheDocument();

    // The hardcoded tabs are gone entirely once carousels drive the rail.
    expect(
      screen.queryByRole("tab", { name: dict.home.popular.tabs.hits }),
    ).not.toBeInTheDocument();
  });

  it("switches the rail to the selected carousel's products, with no product request", async () => {
    // Any call to /api/products in carousel mode is a bug — the server already
    // resolved every tab's list.
    const productCalls: string[] = [];
    server.use(
      http.get("*/api/products", ({ request }) => {
        productCalls.push(request.url);
        return HttpResponse.json(listEnvelope([]));
      }),
    );

    renderWithProviders(
      <PopularRail
        carousels={[
          makeTabCarousel("c1", "Хіти тижня", [
            makeProduct({ id: "p1", name: "Чохол Alpha" }),
          ]),
          makeTabCarousel("c2", "Акційні", [
            makeProduct({ id: "p2", name: "Скло Beta" }),
          ]),
        ]}
      />,
    );

    await userEvent.click(screen.getByRole("tab", { name: "Акційні" }));

    expect(await screen.findByText("Скло Beta")).toBeInTheDocument();
    expect(screen.queryByText("Чохол Alpha")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Акційні" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(productCalls).toHaveLength(0);
  });

  it("drops a carousel that resolved to zero products (never an empty tab)", () => {
    renderWithProviders(
      <PopularRail
        carousels={[
          makeTabCarousel("c1", "Хіти тижня", [
            makeProduct({ id: "p1", name: "Чохол Alpha" }),
          ]),
          makeTabCarousel("c2", "Порожня", []),
        ]}
      />,
    );

    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.queryByRole("tab", { name: "Порожня" })).toBeNull();
  });

  it("keeps the scroll arrows and the tablist a11y contract", async () => {
    Element.prototype.scrollBy =
      Element.prototype.scrollBy ?? (jest.fn() as never);

    renderWithProviders(
      <PopularRail
        carousels={[
          makeTabCarousel("c1", "Хіти тижня", [
            makeProduct({ id: "p1", name: "Чохол Alpha" }),
          ]),
        ]}
      />,
    );

    expect(
      screen.getByRole("tablist", { name: dict.home.popular.tabsAria }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: dict.home.popular.prev }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.home.popular.next }),
    );
    expect(screen.getByText("Чохол Alpha")).toBeInTheDocument();
  });
});

describe("PopularRail — fallback when no HOME_TABS carousel is published", () => {
  it("renders the three legacy tabs and queries the product list", async () => {
    server.use(
      http.get("*/api/products", () =>
        HttpResponse.json(
          listEnvelope([makeProduct({ name: "Дефолтний товар" })]),
        ),
      ),
    );

    renderWithProviders(<PopularRail carousels={[]} />);

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      dict.home.popular.tabs.hits,
      dict.home.popular.tabs.new,
      dict.home.popular.tabs.sale,
    ]);
    expect(await screen.findByText("Дефолтний товар")).toBeInTheDocument();
  });

  it("asks the API for the discounted set on the «Акційні» tab (no client-side filtering)", async () => {
    const requests: URL[] = [];
    server.use(
      http.get("*/api/products", ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json(
          listEnvelope([
            makeProduct({ name: "Знижений товар", compareAtPrice: "19.99" }),
          ]),
        );
      }),
    );

    renderWithProviders(<PopularRail />);

    await userEvent.click(
      screen.getByRole("tab", { name: dict.home.popular.tabs.sale }),
    );
    expect(await screen.findByText("Знижений товар")).toBeInTheDocument();

    // The on-sale tab must filter server-side: the old client-side filter over a
    // single (wider) page left the tab looking empty whenever the first page
    // happened to hold few discounted items.
    const saleRequest = requests.find(
      (url) => url.searchParams.get("onSale") === "true",
    );
    expect(saleRequest).toBeDefined();
    expect(saleRequest?.searchParams.get("limit")).toBe("12");
  });

  it("shows the error state when the fallback query fails", async () => {
    server.use(http.get("*/api/products", () => HttpResponse.error()));

    renderWithProviders(<PopularRail />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.home.popular.error,
    );
  });
});

describe("PopularRail — quick-add stock guard (TASK-144 / TASK-077 / TASK-162 / TASK-233)", () => {
  it("disables the quick-add button with an out-of-stock label when the card's own position has no stock", async () => {
    // Out-of-stock cards behave the same whichever tab source feeds them; the
    // carousel path is the one the homepage now takes.
    renderWithProviders(
      <PopularRail
        carousels={[
          makeTabCarousel("c1", "Хіти тижня", [
            makeProduct({
              inStock: false,
              variantSummary: variantSummary({ defaultInStock: true }),
            }),
          ]),
        ]}
      />,
    );

    // Out of stock → the override aria-label is dropped, so the accessible name
    // is the visible "Немає в наявності" label (conveys why it is disabled).
    const button = await screen.findByRole("button", {
      name: dict.addToCart.outOfStock,
    });
    expect(button).toBeDisabled();
  });

  it("renders an enabled quick-add button labelled per product when the default variant is in stock", async () => {
    server.use(
      http.get("*/api/products", () =>
        HttpResponse.json(listEnvelope([makeProduct()])),
      ),
    );

    renderWithProviders(<PopularRail />);

    const button = await screen.findByRole("button", {
      name: dict.productCard.buyAria("Tempered Glass"),
    });
    expect(button).toBeEnabled();
  });
});
