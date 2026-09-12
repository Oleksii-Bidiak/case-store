import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict } from "@/shared/config";
import { AdminProductCardView } from "./admin-product-card-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

const PRODUCT_ID = "product-uuid-1";
const CATEGORY_ID = "category-uuid-1";

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    name: "Чохол MagSafe",
    slug: "chohol-magsafe",
    description: "<p>Прозорий чохол</p>",
    price: "499.00",
    compareAtPrice: "699.00",
    sku: "CASE-15-CLR",
    stock: 7,
    reservedQty: 2,
    physicalQty: 9,
    categoryId: CATEGORY_ID,
    groupId: null,
    brand: { id: "brand-1", name: "Spigen", slug: "spigen", logo: null },
    attributes: { Колір: "Прозорий" },
    positionOrder: 0,
    isActive: true,
    metaTitle: null,
    metaDescription: null,
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-06-02T09:00:00.000Z",
    ratingAverage: null,
    ratingCount: 0,
    specs: [
      {
        key: "material",
        label: "Матеріал",
        type: "TEXT",
        unit: null,
        value: "Силікон",
        isFilterable: true,
      },
    ],
    highlights: [],
    compatibleDeviceModels: [
      {
        id: "model-1",
        name: "iPhone 15 Pro",
        slug: "iphone-15-pro",
        brandName: "Apple",
      },
    ],
    ...overrides,
  };
}

/** Every read the card makes, plus a counter on the owner-only action log. */
function stubCard(
  product: ReturnType<typeof makeProduct> | null = makeProduct(),
) {
  const counts = { auditLog: 0 };
  server.use(
    http.get(`*/api/products/admin/${PRODUCT_ID}`, () =>
      product
        ? HttpResponse.json({ data: product })
        : HttpResponse.json({ message: "Product not found" }, { status: 404 }),
    ),
    http.get(`*/api/products/${PRODUCT_ID}/images`, () =>
      HttpResponse.json({
        data: [
          {
            id: "image-1",
            url: "https://cdn.example.com/a.jpg",
            alt: null,
            blurDataUrl: null,
            sortOrder: 0,
            isPrimary: true,
          },
        ],
      }),
    ),
    http.get(`*/api/addon-services/resolved-for-product/${PRODUCT_ID}`, () =>
      HttpResponse.json({
        data: [
          {
            addonServiceId: "svc-1",
            name: "Встановлення скла",
            description: null,
            price: "150.00",
            source: "template",
          },
        ],
      }),
    ),
    http.get("*/api/categories/admin/tree", () =>
      HttpResponse.json({
        data: [
          {
            id: CATEGORY_ID,
            name: "Чохли",
            slug: "chohly",
            description: null,
            image: null,
            isActive: true,
            sortOrder: 0,
            children: [],
          },
        ],
      }),
    ),
    http.get("*/api/admin/audit-log", () => {
      counts.auditLog += 1;
      return HttpResponse.json({
        data: [
          {
            id: "log-1",
            actorId: "admin-1",
            actorEmail: "owner@example.com",
            actorRole: "ADMIN",
            action: "product.update",
            entityType: "product",
            entityId: PRODUCT_ID,
            summary: `PUT /api/products/${PRODUCT_ID}`,
            diff: null,
            createdAt: "2026-06-02T09:00:00.000Z",
          },
        ],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });
    }),
  );
  return counts;
}

function renderCard(options: { isOwner?: boolean } = {}) {
  return renderWithProviders(
    <WithAuth
      isOwner={options.isOwner ?? true}
      permissions={options.isOwner === false ? ["products:read"] : []}
    >
      <AdminProductCardView productId={PRODUCT_ID} />
    </WithAuth>,
  );
}

/**
 * TASK-427. Until this page, the only way to LOOK at a product was to open its
 * edit form — 30 inputs, an unsaved-changes hazard, and a `products:write`
 * permission a reader should not need.
 */
describe("AdminProductCardView — read-only rendering (TASK-427)", () => {
  it("shows the staff facts the customer preview cannot", async () => {
    stubCard();
    renderCard();

    await screen.findByText("Чохол MagSafe");

    // The stock split, the add-on exceptions and the structured specs are
    // exactly what `/products/preview/[slug]` (the customer's view) omits.
    expect(screen.getByText(dict.products.previewReserved)).toBeInTheDocument();
    expect(screen.getByText("Силікон")).toBeInTheDocument();
    expect(screen.getByText("Встановлення скла")).toBeInTheDocument();
    expect(screen.getByText("Apple iPhone 15 Pro")).toBeInTheDocument();
    expect(screen.getByText("Чохли")).toBeInTheDocument();
    expect(screen.getByText("Spigen")).toBeInTheDocument();
  });

  it("renders no form controls at all — it is a card, not an editor", async () => {
    stubCard();
    const { container } = renderCard();
    await screen.findByText("Чохол MagSafe");

    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("links both ways — to the edit form and back to the list", async () => {
    stubCard();
    renderCard();
    await screen.findByText("Чохол MagSafe");

    expect(
      screen.getByRole("link", { name: dict.products.cardEditLink }),
    ).toHaveAttribute("href", `/products/${PRODUCT_ID}/edit`);
    expect(
      screen.getByRole("link", { name: dict.products.cardBack }),
    ).toHaveAttribute("href", "/products");
  });

  // A soft-deleted product 404s on every by-id read, so this is also what an
  // operator sees when someone deletes the product they were about to open.
  it("explains a 404 as a probable delete instead of a generic failure", async () => {
    stubCard(null);
    renderCard();

    expect(
      await screen.findByText(dict.products.cardNotFound),
    ).toBeInTheDocument();
  });
});

/**
 * The history panel's constraint (TASK-427): `GET /api/admin/audit-log` is
 * `@OwnerOnly()` and deliberately not a grantable permission, so a MANAGER
 * cannot read it. The panel must not invent a permission, must not fire a
 * request that can only 403, and must not leave a broken panel behind.
 */
describe("AdminProductCardView — change history (TASK-427)", () => {
  it("shows the log to the owner", async () => {
    stubCard();
    renderCard({ isOwner: true });
    await screen.findByText("Чохол MagSafe");

    expect(await screen.findByText("product.update")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
  });

  it("tells a manager whose history it is, and never asks the server", async () => {
    const counts = stubCard();
    renderCard({ isOwner: false });
    await screen.findByText("Чохол MagSafe");

    expect(
      screen.getByText(dict.products.historyOwnerOnly),
    ).toBeInTheDocument();
    // No request at all — a 403 here would surface as a broken panel on a page
    // the manager is otherwise entitled to read.
    await waitFor(() => expect(counts.auditLog).toBe(0));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(dict.products.historyLoadError)).toBeNull();
  });
});
