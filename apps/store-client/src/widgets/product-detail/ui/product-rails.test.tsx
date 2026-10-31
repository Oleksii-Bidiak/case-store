/**
 * The PDP rails follow the active device (Д3-2 Product §6.9) and sell only
 * what is in stock.
 */
import { http, HttpResponse } from "msw";

import { addDevice, clearMyDevices, setLabel } from "@/entities/my-devices";
import { dict } from "@/shared/config";
import { server } from "@/shared/test/msw-server";
import { renderWithProviders, screen, within } from "@/shared/test/render";

import { ProductRails } from "./product-rails";

function makeProduct(id: string, name: string, inStock = true) {
  return {
    id,
    name,
    slug: id,
    description: null,
    price: "12.99",
    compareAtPrice: null,
    sku: id.toUpperCase(),
    inStock,
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
      defaultInStock: inStock,
      colors: [],
    },
  };
}

const seen: URLSearchParams[] = [];

beforeEach(() => {
  window.localStorage.clear();
  clearMyDevices();
  seen.length = 0;
  server.use(
    http.get("*/api/products", ({ request }) => {
      const params = new URL(request.url).searchParams;
      seen.push(params);
      const model = params.get("deviceModelId");
      const rows = model
        ? [
            makeProduct("current", "Поточний"),
            makeProduct(`for-${model}`, `Для ${model}`),
            makeProduct("sold-out", "Розпродано", false),
          ]
        : [makeProduct("r-1", "Скло")];
      return HttpResponse.json({
        data: rows,
        meta: { total: rows.length, page: 1, limit: 9, totalPages: 1 },
      });
    }),
  );
});

const category = { id: "cat-1", name: "Чохли", slug: "chohly" };
const models = [
  { id: "m-15", name: "iPhone 15", slug: "iphone-15", brandName: "Apple" },
];
const rail = dict.deviceFit.rail;

describe("ProductRails", () => {
  it("without a device, lists by the product's model as «До цього товару беруть»", async () => {
    renderWithProviders(
      <ProductRails
        productId="current"
        compatibleModels={models}
        category={category}
      />,
    );
    await screen.findByText("Для m-15");
    const region = screen.getByRole("region", { name: rail.titleNone });
    expect(region).toHaveTextContent(rail.kickerNone);
    expect(
      within(region).getByRole("link", { name: rail.seeAll }),
    ).toHaveAttribute("href", "/devices/iphone-15");
  });

  it("with an active device, says «Ще для …» and lists for THAT device", async () => {
    addDevice({
      modelId: "m-13",
      slug: "iphone-13",
      name: "iPhone 13",
      brandName: "Apple",
      family: "iphone",
    });
    setLabel("m-13", "Мама");
    renderWithProviders(
      <ProductRails
        productId="current"
        compatibleModels={models}
        category={category}
      />,
    );
    await screen.findByText("Для m-13");
    const region = screen.getByRole("region", {
      name: rail.titleMine("iPhone 13"),
    });
    expect(region).toHaveTextContent(rail.kickerLabelled("Мама"));
    expect(
      within(region).getByRole("link", { name: rail.allFor("iPhone 13") }),
    ).toHaveAttribute("href", "/devices/iphone-13");
  });

  it("asks for in-stock products only and drops the current and sold-out ones", async () => {
    renderWithProviders(
      <ProductRails
        productId="current"
        compatibleModels={models}
        category={category}
      />,
    );
    await screen.findByText("Для m-15");
    expect(seen.every((params) => params.get("inStock") === "true")).toBe(true);
    expect(screen.queryByText("Розпродано")).toBeNull();
    expect(screen.queryByText("Поточний")).toBeNull();
  });

  it("names the category rail and links to the category", async () => {
    renderWithProviders(
      <ProductRails
        productId="current"
        compatibleModels={[]}
        category={category}
      />,
    );
    await screen.findByText("Скло");
    const region = screen.getByRole("region", {
      name: rail.categoryTitle("Чохли"),
    });
    expect(
      within(region).getByRole("link", { name: rail.categoryLink }),
    ).toHaveAttribute("href", "/categories/chohly");
    // No device and no compatibility data → no device rail at all.
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });
});
