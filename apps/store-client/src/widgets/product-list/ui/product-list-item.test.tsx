/**
 * ProductListItem — the catalog list row (Д3-2 Catalog §4, TASK-1958).
 */
import { renderWithProviders, screen, within } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { PublicProductEntity } from "@/shared/api/generated/models";
import { addDevice, clearMyDevices } from "@/entities/my-devices";
import { formatMoney } from "@/shared/lib";

import { ProductListItem } from "./product-list-item";

function makeProduct(
  overrides: Partial<PublicProductEntity> = {},
): PublicProductEntity {
  return {
    id: "p-1",
    name: "Clear Case iPhone 15 Pro",
    slug: "clear-case-15-pro",
    description: null,
    price: "999",
    compareAtPrice: null,
    sku: "CC-15P",
    inStock: true,
    lowStock: false,
    categoryId: "cat-1",
    groupId: null,
    attributes: {},
    positionOrder: 0,
    isActive: true,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    ratingAverage: null,
    ratingCount: 0,
    primaryImage: null,
    compatibleDeviceModelIds: ["m-15pro"],
    variantSummary: {
      groupId: null,
      variantCount: 1,
      priceFrom: "999",
      defaultVariantId: "p-1",
      defaultVariantSlug: "clear-case-15-pro",
      defaultInStock: true,
      colors: [],
    },
    ...overrides,
  } as PublicProductEntity;
}

beforeEach(() => {
  window.localStorage.clear();
  clearMyDevices();
});

describe("ProductListItem", () => {
  it("lays out photo, body and a buy area that spans the row below md and is a 250px column from md", () => {
    const { container } = renderWithProviders(
      <ProductListItem product={makeProduct()} />,
    );
    const row = container.querySelector('[data-slot="product-list-item"]');
    expect(row).toHaveClass("flex-wrap", "md:flex-nowrap", "md:items-center");
    const [photo, , buy] = Array.from(row?.children ?? []);
    expect(photo).toHaveClass("size-24", "md:size-33");
    expect(buy).toHaveClass("basis-full", "md:w-62.5");
    // Price → stock line → buttons, in that order, inside the buy area.
    const area = buy as HTMLElement;
    const text = area.textContent ?? "";
    expect(text.indexOf(formatMoney("999"))).toBe(0);
    expect(text.indexOf(dict.productCard.inStockLine)).toBeGreaterThan(0);
    expect(
      within(area).getByRole("button", {
        name: dict.productCard.buyAria("Clear Case iPhone 15 Pro"),
      }),
    ).toBeInTheDocument();
  });

  it("puts the fit mark in the body under the rating, not in the buy area", () => {
    addDevice({
      modelId: "m-15pro",
      slug: "iphone-15-pro",
      name: "iPhone 15 Pro",
      brandName: "Apple",
      family: "iphone",
    });
    const { container } = renderWithProviders(
      <ProductListItem product={makeProduct()} />,
    );
    const mark = screen.getByText(dict.deviceFit.fits("iPhone 15 Pro"));
    const row = container.querySelector('[data-slot="product-list-item"]');
    expect(row?.children[1].contains(mark)).toBe(true);
    expect(row?.children[2].contains(mark)).toBe(false);
  });

  it("offers quick view as a pill in the body", () => {
    const { container } = renderWithProviders(
      <ProductListItem product={makeProduct()} />,
    );
    const trigger = screen.getByRole("button", {
      name: dict.quickView.trigger("Clear Case iPhone 15 Pro"),
    });
    const row = container.querySelector('[data-slot="product-list-item"]');
    expect(row?.children[1].contains(trigger)).toBe(true);
    expect(trigger).toHaveClass("rounded-full", "bg-muted");
  });
});
