import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { PERM } from "@/entities/permission";
import { AdminProductPreviewView } from "./admin-product-preview-view";

const o = dict.productOverview;

/** Testing Library collapses a node's whitespace (the NBSP in «1 299 ₴» too). */
const norm = (text: string) => text.replace(/\s+/g, " ");

const PRODUCT_ID = "product-uuid-1";
const GROUP_ID = "group-uuid-1";

function makeEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: PRODUCT_ID,
      name: "Силіконовий чохол MagSafe — Чорний",
      slug: "case-black",
      description: "<p>Рідкий <strong>силікон</strong></p>",
      price: "1299.00",
      compareAtPrice: "1599.00",
      sku: "CASE-BK",
      stock: 25,
      reservedQty: 2,
      physicalQty: 27,
      categoryId: "cat-1",
      groupId: null,
      brand: { id: "b-1", name: "Apple", slug: "apple" },
      attributes: {},
      positionOrder: 0,
      isActive: true,
      metaTitle: null,
      metaDescription: null,
      keywords: [],
      ogImage: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ratingAverage: null,
      ratingCount: 0,
      compatibleDeviceModels: [
        { id: "m-1", name: "iPhone 15", slug: "iphone-15", brandName: "Apple" },
      ],
      specs: [
        {
          key: "material",
          label: "Матеріал",
          type: "TEXT",
          unit: null,
          value: "Силікон",
          isFilterable: false,
        },
      ],
      highlights: [],
      ...overrides,
    },
    category: { id: "cat-1", name: "Чохли для iPhone", slug: "iphone-cases" },
    group: null,
    images: [
      {
        id: "img-1",
        url: "https://cdn.example/1.jpg",
        alt: null,
        sortOrder: 0,
        isPrimary: true,
      },
      {
        id: "img-2",
        url: "https://cdn.example/2.jpg",
        alt: null,
        sortOrder: 1,
        isPrimary: false,
      },
    ],
  };
}

function stub({
  envelope = makeEnvelope() as Record<string, unknown>,
  categoryVisible = true,
  group = null as Record<string, unknown> | null,
  audit = [] as Record<string, unknown>[],
  previewStatus = 200,
} = {}) {
  server.use(
    http.get("*/api/products/admin/preview/:slug", () =>
      previewStatus === 200
        ? HttpResponse.json(envelope)
        : HttpResponse.json({ message: "x" }, { status: previewStatus }),
    ),
    http.get("*/api/categories/:slug", () =>
      categoryVisible
        ? HttpResponse.json({
            data: {
              id: "cat-1",
              name: "Чохли для iPhone",
              slug: "iphone-cases",
            },
          })
        : HttpResponse.json({ message: "Not found" }, { status: 404 }),
    ),
    http.get(`*/api/product-groups/${GROUP_ID}`, () =>
      HttpResponse.json({ data: group }),
    ),
    http.get("*/api/admin/audit-log", () =>
      HttpResponse.json({
        data: audit,
        meta: { total: audit.length, page: 1, limit: 4, totalPages: 1 },
      }),
    ),
    http.get("*/api/addon-services/admin/resolved-for-product/:id", () =>
      HttpResponse.json({
        data: [
          {
            addonServiceId: "a-1",
            name: "Наклеювання скла",
            price: "150.00",
            source: "template",
          },
        ],
      }),
    ),
    http.get("*/api/seo-settings", () =>
      HttpResponse.json({ data: { titleTemplate: "%s | Case" } }),
    ),
  );
}

const WRITER = {
  permissions: [
    PERM.productsRead,
    PERM.productsWrite,
    PERM.categoriesWrite,
    PERM.auditRead,
  ],
};
const READER = { permissions: [PERM.productsRead] };

function renderView(auth: { permissions: string[] } = WRITER) {
  return renderWithProviders(<AdminProductPreviewView slug="case-black" />, {
    auth,
  });
}

describe("AdminProductPreviewView — header (ПП1)", () => {
  it("is titled by the product with «На сайті», the address and the two actions", async () => {
    stub();
    renderView();

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Силіконовий чохол MagSafe — Чорний",
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText(o.onSite)).toBeInTheDocument();
    expect(screen.getByText("/products/case-black")).toBeInTheDocument();
    const site = screen.getByRole("link", { name: o.viewOnSite });
    expect(site).toHaveAttribute(
      "href",
      `${STOREFRONT_URL}/products/case-black`,
    );
    expect(site).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: o.edit })).toHaveAttribute(
      "href",
      `/products/${PRODUCT_ID}/edit`,
    );
    expect(screen.getByRole("link", { name: o.back })).toHaveAttribute(
      "href",
      "/products",
    );
  });

  it("renders the description instead of printing its tags (AD-PROD-26)", async () => {
    stub();
    renderView();

    const strong = await screen.findByText("силікон");
    expect(strong.tagName).toBe("STRONG");
    expect(screen.queryByText(/<p>/)).not.toBeInTheDocument();
  });

  it("shows the price with the old one and the discount", async () => {
    stub();
    renderView();

    expect(await screen.findByText(norm("1 299 ₴"))).toBeInTheDocument();
    expect(screen.getByText(norm("1 599 ₴"))).toBeInTheDocument();
    expect(screen.getByText(o.discount(19))).toBeInTheDocument();
  });

  it("lists the add-on services, brand and SKU", async () => {
    stub();
    renderView();

    expect(await screen.findByText("Наклеювання скла")).toBeInTheDocument();
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("CASE-BK")).toBeInTheDocument();
  });
});

describe("AdminProductPreviewView — visibility (ПП3, ПП4)", () => {
  it("a switched-off product: «Прихований», the reason in words and «Увімкнути →»", async () => {
    stub({ envelope: makeEnvelope({ isActive: false }) });
    renderView();

    expect(await screen.findByText(o.hidden)).toBeInTheDocument();
    expect(screen.getByText(o.hiddenWhyOff)).toBeInTheDocument();
    expect(screen.getByText(o.visDisabled)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: o.visFixEnable })).toHaveAttribute(
      "href",
      `/products/${PRODUCT_ID}/edit`,
    );
    // The storefront 404s for a hidden product; its temporary link is TASK-670.
    expect(
      screen.queryByRole("link", { name: o.viewOnSite }),
    ).not.toBeInTheDocument();
  });

  it("an enabled product in a hidden category — visible nowhere today", async () => {
    stub({ categoryVisible: false });
    renderView();

    expect(
      await screen.findByText(o.hiddenWhyCategory("Чохли для iPhone")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(o.visCategoryHidden("Чохли для iPhone")),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: o.visFixCategory }),
    ).toHaveAttribute("href", "/categories/cat-1/edit");
    expect(screen.getByText(o.hidden)).toBeInTheDocument();
  });

  it("says every condition when the product is public", async () => {
    stub();
    renderView();

    expect(
      await screen.findByText(o.visCategoryShown("Чохли для iPhone")),
    ).toBeInTheDocument();
    expect(screen.getByText(o.visEnabled)).toBeInTheDocument();
    expect(screen.getByText(o.visNotDeleted)).toBeInTheDocument();
  });
});

describe("AdminProductPreviewView — right column", () => {
  it("keeps the stock split: sellable, reserved, physical (TASK-254)", async () => {
    stub();
    renderView();

    const stock = await screen.findByRole("region", { name: o.stock });
    expect(
      within(stock).getByText(o.stockSellable).closest("div"),
    ).toHaveTextContent("25");
    expect(
      within(stock).getByText(o.stockReserved).closest("div"),
    ).toHaveTextContent("2");
    expect(
      within(stock).getByText(o.stockPhysical).closest("div"),
    ).toHaveTextContent("27");
  });

  it("marks the snippet as automatic or overridden", async () => {
    stub();
    const { unmount } = renderView();
    expect(await screen.findByText(o.seoAuto)).toBeInTheDocument();
    unmount();

    stub({ envelope: makeEnvelope({ metaTitle: "Чохол MagSafe чорний" }) });
    renderView();
    expect(await screen.findByText(o.seoOverridden)).toBeInTheDocument();
  });

  it("lists every variant of the group — a hidden one is marked, not dropped", async () => {
    stub({
      envelope: makeEnvelope({ groupId: GROUP_ID, isActive: false }),
      group: {
        id: GROUP_ID,
        name: "Силіконовий чохол MagSafe",
        isActive: true,
        axes: [{ name: "Колір", sortOrder: 0 }],
        positions: [
          {
            id: PRODUCT_ID,
            slug: "case-black",
            name: "Чорний",
            price: "1299.00",
            attributes: { Колір: "Чорний" },
            stock: 25,
            isActive: false,
            positionOrder: 0,
          },
          {
            id: "p-2",
            slug: "case-white",
            name: "Білий",
            price: "1299.00",
            attributes: { Колір: "Білий" },
            stock: 3,
            isActive: true,
            positionOrder: 1,
          },
          {
            id: "p-3",
            slug: "case-pink",
            name: "Рожевий",
            price: "1349.00",
            attributes: { Колір: "Рожевий" },
            stock: 0,
            isActive: false,
            positionOrder: 2,
          },
        ],
      },
    });
    renderView();

    const group = await screen.findByRole("region", { name: o.groupCount(3) });
    expect(within(group).getByText(o.groupThisHidden)).toBeInTheDocument();
    expect(within(group).getByText(o.groupHidden)).toBeInTheDocument();
    expect(within(group).getByRole("link", { name: /Білий/ })).toHaveAttribute(
      "href",
      "/products/preview/case-white",
    );
    expect(
      within(group).getByRole("link", { name: o.groupOpen }),
    ).toHaveAttribute("href", `/product-groups/${GROUP_ID}/edit`);
  });

  it("shows the change history to a reader of the log, with «Уся історія →»", async () => {
    stub({
      audit: [
        {
          id: "a-1",
          actorId: "u-1",
          actorEmail: "manager@store.com",
          actorRole: "MANAGER",
          action: "product.update",
          entityType: "product",
          entityId: PRODUCT_ID,
          summary: "Ціна змінена",
          diff: null,
          createdAt: "2026-09-28T13:12:00.000Z",
        },
      ],
    });
    renderView();

    const history = await screen.findByRole("region", { name: o.history });
    expect(
      await within(history).findByText("Ціна змінена"),
    ).toBeInTheDocument();
    expect(
      within(history).getByRole("link", { name: o.historyAll }),
    ).toHaveAttribute("href", `/products/${PRODUCT_ID}`);
  });

  it("without products:write and audit:read: no «Редагувати», no history (ПП7)", async () => {
    stub();
    renderView(READER);

    await screen.findByText(o.onSite);
    expect(
      screen.queryByRole("link", { name: o.edit }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: o.history }),
    ).not.toBeInTheDocument();
  });
});

describe("AdminProductPreviewView — empty sections explain the consequence (ПП5)", () => {
  it("says what a missing photo, spec, compatibility and group mean", async () => {
    stub({
      envelope: {
        ...makeEnvelope({
          sku: null,
          specs: [],
          compatibleDeviceModels: [],
          compareAtPrice: null,
        }),
        images: [],
      },
    });
    renderView();

    expect(await screen.findByText(o.noPhotos)).toBeInTheDocument();
    expect(screen.getByText(o.specsEmpty)).toBeInTheDocument();
    expect(screen.getByText(o.compatEmpty)).toBeInTheDocument();
    expect(screen.getByText(o.groupNone)).toBeInTheDocument();
    expect(screen.getByText(o.skuMissing)).toBeInTheDocument();
  });
});

describe("AdminProductPreviewView — photos", () => {
  it("switches the large photo from the thumbnails", async () => {
    stub();
    renderView();

    await userEvent.click(
      await screen.findByRole("button", { name: o.photoThumbAria(2) }),
    );
    expect(
      screen.getByRole("button", { name: o.photoThumbAria(2) }),
    ).toHaveAttribute("aria-current", "true");
  });
});

describe("AdminProductPreviewView — errors (ПП9, ПП10)", () => {
  it("says the product is not found on a 404", async () => {
    stub({ previewStatus: 404 });
    renderView();

    expect(await screen.findByText(o.notFound)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: o.toList })).toHaveAttribute(
      "href",
      "/products",
    );
    expect(
      screen.queryByRole("button", { name: o.retry }),
    ).not.toBeInTheDocument();
  });

  it("offers a retry on a network error", async () => {
    stub({ previewStatus: 500 });
    renderView();

    expect(await screen.findByText(o.loadError)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: o.retry })).toBeInTheDocument();
  });
});
