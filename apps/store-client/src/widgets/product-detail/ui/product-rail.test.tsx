import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ProductRail } from "./product-rail";

function makeProduct(id: string, name: string) {
  return {
    id,
    name,
    slug: id,
    description: null,
    price: "12.99",
    compareAtPrice: null,
    sku: id.toUpperCase(),
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
    variantSummary: {
      groupId: null,
      variantCount: 1,
      priceFrom: "12.99",
      defaultVariantId: id,
      defaultVariantSlug: id,
      defaultInStock: true,
      colors: [],
    },
  };
}

/**
 * `/api/products` answers by filter: a device-model query gets the compatible
 * accessories, a category query the related products. Both lists also carry the
 * current product, which each rail must leave out.
 */
function stubProducts() {
  server.use(
    http.get("*/api/products", ({ request }) => {
      const url = new URL(request.url);
      const rows = url.searchParams.get("deviceModelId")
        ? [makeProduct("current", "Поточний"), makeProduct("c-1", "Чохол")]
        : url.searchParams.get("categoryId")
          ? [makeProduct("current", "Поточний"), makeProduct("r-1", "Скло")]
          : [];
      return HttpResponse.json({
        data: rows,
        meta: { total: rows.length, page: 1, limit: 9, totalPages: 1 },
      });
    }),
  );
}

function renderBothRails() {
  return renderWithProviders(
    <>
      <ProductRail
        title={dict.product.compatibleTitle}
        headingId="compatible-heading"
        filter={{ deviceModelId: "dm-1" }}
        excludeId="current"
      />
      <ProductRail
        title={dict.product.relatedTitle}
        headingId="related-heading"
        filter={{ categoryId: "cat-1" }}
        excludeId="current"
      />
    </>,
  );
}

describe("ProductRail (TASK-813)", () => {
  it("gives the four arrows of a PDP with both rails four different names", async () => {
    stubProducts();
    renderBothRails();

    await screen.findByText("Чохол");
    await screen.findByText("Скло");

    const names = [
      dict.product.railPrev(dict.product.compatibleTitle),
      dict.product.railNext(dict.product.compatibleTitle),
      dict.product.railPrev(dict.product.relatedTitle),
      dict.product.railNext(dict.product.relatedTitle),
    ];
    expect(new Set(names).size).toBe(4);
    for (const name of names) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("lists by its own filter and leaves the current product out", async () => {
    stubProducts();
    renderBothRails();
    // The loading skeleton is a labelled region too — wait for the cards.
    await screen.findByText("Чохол");
    await screen.findByText("Скло");

    const compatible = screen.getByRole("region", {
      name: dict.product.compatibleTitle,
    });
    expect(compatible).toHaveTextContent("Чохол");
    expect(compatible).not.toHaveTextContent("Скло");
    expect(compatible).not.toHaveTextContent("Поточний");

    const related = screen.getByRole("region", {
      name: dict.product.relatedTitle,
    });
    expect(related).toHaveTextContent("Скло");
    expect(related).not.toHaveTextContent("Чохол");
  });

  it("renders nothing when the current product is the only match", async () => {
    server.use(
      http.get("*/api/products", () =>
        HttpResponse.json({
          data: [makeProduct("current", "Поточний")],
          meta: { total: 1, page: 1, limit: 9, totalPages: 1 },
        }),
      ),
    );
    renderWithProviders(
      <ProductRail
        title={dict.product.relatedTitle}
        headingId="related-heading"
        filter={{ categoryId: "cat-1" }}
        excludeId="current"
      />,
    );

    // The skeleton carries the heading while loading; it goes with the data.
    expect(
      screen.getByRole("heading", { name: dict.product.relatedTitle }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: dict.product.relatedTitle }),
      ).toBeNull(),
    );
  });
});
