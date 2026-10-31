/**
 * `/devices/<модель>` page composition (TASK-1954): the hub's cards wear the
 * real ProductCardActions footer, but never the device-fit mark — everything
 * on the hub fits the page's model, and a «Не для <інший пристрій>» mark for
 * the shopper's active device would contradict the hero (mockup §1.6).
 */
import { act } from "react";
import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { addDevice, clearMyDevices } from "@/entities/my-devices";
import type {
  DeviceHubEntity,
  PublicProductEntity,
} from "@/shared/api/generated/models";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: jest.fn(),
}));

function product(id: string): PublicProductEntity {
  return {
    id,
    slug: id,
    name: `Товар ${id}`,
    price: "499",
    compareAtPrice: null,
    inStock: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    primaryImage: null,
    variantSummary: null,
    ratingAverage: null,
    ratingCount: 0,
    // Compatible with the hub's model only — NOT with the shopper's device.
    compatibleDeviceModelIds: ["m-15pro"],
  } as unknown as PublicProductEntity;
}

const hub = {
  model: {
    id: "m-15pro",
    name: "iPhone 15 Pro",
    slug: "iphone-15-pro",
    brandName: "Apple",
    brandSlug: "apple",
    series: "iPhone 15",
    metaTitle: null,
    metaDescription: null,
    description: null,
  },
  productCount: 3,
  groups: [
    {
      category: { id: "c1", name: "Чохли", slug: "cases" },
      productCount: 3,
      products: [product("case-1"), product("case-2"), product("case-3")],
    },
  ],
} as unknown as DeviceHubEntity;

jest.mock("@/shared/api/device-hubs-server", () => ({
  fetchDeviceHub: jest.fn(async () => hub),
  fetchSeriesSiblings: jest.fn(async () => []),
}));
jest.mock("@/shared/api/seo-settings-server", () => ({
  fetchSeoSettings: jest.fn(async () => null),
}));
jest.mock("@/shared/lib/slug-redirect", () => ({
  resolveSlugRedirect: jest.fn(async () => null),
}));

import DeviceHubPage from "./page";

describe("/devices/[model] page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearMyDevices();
  });

  afterEach(() => act(() => clearMyDevices()));

  it("never renders the device-fit mark on hub cards, even for another active device", async () => {
    addDevice({
      modelId: "m-13",
      slug: "iphone-13",
      name: "iPhone 13",
      brandName: "Apple",
      family: "iphone",
    });

    const ui = await DeviceHubPage({
      params: Promise.resolve({ model: "iphone-15-pro" }),
    });
    const { container } = renderWithProviders(ui);

    // The cards do carry the real footer…
    expect(
      screen.getAllByRole("button", {
        name: dict.productCard.buyAria("Товар case-1"),
      }),
    ).toHaveLength(1);
    // …but no fit mark, and no slot reserved for one.
    expect(
      container.querySelector('[data-slot="device-fit-mark"]'),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="device-fit-slot"]'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(dict.deviceFit.notFor("iPhone 13")),
    ).not.toBeInTheDocument();
  });
});
