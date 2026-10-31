/**
 * DeviceHubView (TASK-1954): sections link to their compat landings, chips
 * jump to sections, the series panel links sibling hubs, and the server
 * render carries no personal device state.
 */
import { render, screen, within } from "@testing-library/react";
import type {
  DeviceHubEntity,
  DeviceModelListItemEntity,
  PublicProductEntity,
} from "@/shared/api/generated/models";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import { DeviceHubView } from "./device-hub-view";

function product(id: string): PublicProductEntity {
  return {
    id,
    slug: id,
    name: `Товар ${id}`,
    price: 499,
    compareAtPrice: null,
    inStock: true,
    createdAt: "2020-01-01T00:00:00.000Z",
    primaryImage: null,
    variantSummary: null,
    ratingAverage: null,
    ratingCount: 0,
  } as unknown as PublicProductEntity;
}

const hub = {
  model: {
    id: "m1",
    name: "iPhone 15 Pro",
    slug: "iphone-15-pro",
    brandName: "Apple",
    brandSlug: "apple",
    series: "iPhone 15",
    metaTitle: null,
    metaDescription: null,
    description: null,
  },
  productCount: 1290,
  groups: [
    {
      category: { id: "c1", name: "Чохли", slug: "cases" },
      productCount: 1250,
      products: Array.from({ length: 8 }, (_, i) => product(`case-${i}`)),
    },
    {
      category: { id: "c2", name: "Захисне скло", slug: "screen-protectors" },
      productCount: 40,
      products: [product("glass-1")],
    },
  ],
} as unknown as DeviceHubEntity;

const siblings = [
  {
    id: "m2",
    name: "iPhone 15 Pro Max",
    slug: "iphone-15-pro-max",
    series: "iPhone 15",
    brandName: "Apple",
    brandSlug: "apple",
    productCount: 117,
  },
] as unknown as DeviceModelListItemEntity[];

describe("DeviceHubView", () => {
  it("renders one section per group with five cards and a link to its landing", () => {
    render(
      <DeviceHubView
        hub={hub}
        siblings={siblings}
        renderCardAction={(p) => <span>action {p.id}</span>}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Все для iPhone 15 Pro" }),
    ).toBeInTheDocument();

    const cases = screen.getByRole("region", { name: "Чохли" });
    expect(cases).toHaveAttribute("id", "cases");
    expect(within(cases).getAllByText(/^action /)).toHaveLength(5);
    expect(
      within(cases).getByRole("link", { name: /Усі чохли для iPhone 15 Pro/ }),
    ).toHaveAttribute("href", "/catalog/cases/iphone-15-pro");
    expect(
      within(cases).getByText(/^1\s250 товарів для iPhone 15 Pro$/),
    ).toBeInTheDocument();
  });

  it("jumps from a chip to its section by #slug", () => {
    render(<DeviceHubView hub={hub} siblings={[]} />);
    const chips = screen.getByRole("navigation", {
      name: "Категорії для моделі",
    });
    expect(
      within(chips).getByRole("link", { name: "Захисне скло: 40 товарів" }),
    ).toHaveAttribute("href", "#screen-protectors");
  });

  it("links the rest of the series to their hubs, and hides the panel without siblings", () => {
    const { rerender } = render(
      <DeviceHubView hub={hub} siblings={siblings} />,
    );
    const related = screen.getByRole("region", { name: "Інші моделі" });
    expect(
      within(related).getByRole("heading", { name: "Інші моделі iPhone 15" }),
    ).toBeInTheDocument();
    expect(
      within(related).getByRole("link", {
        name: "Все для iPhone 15 Pro Max: 117 товарів",
      }),
    ).toHaveAttribute("href", "/devices/iphone-15-pro-max");

    rerender(<DeviceHubView hub={hub} siblings={[]} />);
    expect(
      screen.queryByRole("region", { name: "Інші моделі" }),
    ).not.toBeInTheDocument();
  });

  it("shows the neutral kicker and «Пристрої» as plain text until /devices exists", () => {
    render(<DeviceHubView hub={hub} siblings={[]} />);
    expect(screen.getByText("Apple · iPhone 15")).toBeInTheDocument();
    const crumbs = screen.getByRole("navigation", {
      name: "Навігаційний ланцюжок",
    });
    // TASK-2076 ships the index; until then the crumb must not link to a 404.
    expect(
      within(crumbs).queryByRole("link", { name: "Пристрої" }),
    ).not.toBeInTheDocument();
    const devices = within(crumbs).getByText("Пристрої");
    expect(devices).not.toHaveAttribute("aria-current");
    expect(within(crumbs).getByText("Все для iPhone 15 Pro")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
