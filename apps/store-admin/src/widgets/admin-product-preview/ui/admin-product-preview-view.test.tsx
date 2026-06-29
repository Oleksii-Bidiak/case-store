import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminProductPreviewView } from "./admin-product-preview-view";

function makePreviewEnvelope(overrides: { isActive: boolean }) {
  return {
    data: {
      id: "product-uuid-1",
      name: "Discontinued Case",
      slug: "discontinued-case",
      description: "A premium clear case",
      price: "29.99",
      compareAtPrice: null,
      sku: "DSC-001",
      stock: 0,
      categoryId: "cat-1",
      groupId: null,
      attributes: {},
      positionOrder: 0,
      isActive: overrides.isActive,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ratingAverage: null,
      ratingCount: 0,
    },
    category: { id: "cat-1", name: "Phone Cases", slug: "phone-cases" },
    group: null,
    images: [],
  };
}

describe("AdminProductPreviewView (TASK-155)", () => {
  it("shows the deactivated banner when the product is inactive", async () => {
    server.use(
      http.get("*/api/products/admin/preview/:slug", () =>
        HttpResponse.json(makePreviewEnvelope({ isActive: false })),
      ),
    );

    renderWithProviders(<AdminProductPreviewView slug="discontinued-case" />);

    expect(
      await screen.findByText(dict.products.previewDeactivatedBanner),
    ).toBeInTheDocument();
    expect(screen.getByText("Discontinued Case")).toBeInTheDocument();
    expect(screen.getByText(dict.products.previewInactive)).toBeInTheDocument();
  });

  it("does not show the deactivated banner when the product is active", async () => {
    server.use(
      http.get("*/api/products/admin/preview/:slug", () =>
        HttpResponse.json(makePreviewEnvelope({ isActive: true })),
      ),
    );

    renderWithProviders(<AdminProductPreviewView slug="discontinued-case" />);

    expect(await screen.findByText("Discontinued Case")).toBeInTheDocument();
    expect(
      screen.queryByText(dict.products.previewDeactivatedBanner),
    ).not.toBeInTheDocument();
    expect(screen.getByText(dict.products.previewActive)).toBeInTheDocument();
  });

  it("renders an error state with a back link when the fetch fails", async () => {
    server.use(
      http.get("*/api/products/admin/preview/:slug", () =>
        HttpResponse.json({ message: "Not found" }, { status: 404 }),
      ),
    );

    renderWithProviders(<AdminProductPreviewView slug="missing" />);

    expect(
      await screen.findByText(dict.products.previewLoadError),
    ).toBeInTheDocument();
  });
});
