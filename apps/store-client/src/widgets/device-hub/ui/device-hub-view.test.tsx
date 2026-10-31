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
      category: { id: "c1", name: "Чохли", slug: "cases", icon: "cases" },
      productCount: 1250,
      products: Array.from({ length: 8 }, (_, i) => product(`case-${i}`)),
    },
    {
      category: {
        id: "c2",
        name: "Захисне скло",
        slug: "screen-protectors",
        icon: null,
      },
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
    // Visible «Усі 1 250 →»; the accessible name keeps that text as its
    // prefix and adds the category + model for screen readers.
    const seeAll = within(cases).getByRole("link", {
      name: /^Усі 1\s250\s+— чохли для iPhone 15 Pro$/,
    });
    expect(seeAll).toHaveAttribute("href", "/catalog/cases/iphone-15-pro");
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

  // TASK-1956: chips and section pads draw `Category.icon` from the sprite;
  // a category without an icon (or with an unknown key) gets the folder.
  it("draws each category's sprite icon on its chip and section, folder when missing", () => {
    const withUnknown = {
      ...hub,
      groups: [
        ...hub.groups,
        {
          category: {
            id: "c3",
            name: "Кабелі",
            slug: "cables",
            icon: "rocket",
          },
          productCount: 3,
          products: [product("cable-1")],
        },
      ],
    } as unknown as DeviceHubEntity;
    render(<DeviceHubView hub={withUnknown} siblings={[]} />);
    const href = (el: HTMLElement) =>
      el.querySelector("use")?.getAttribute("href");

    const chips = screen.getByRole("navigation", {
      name: "Категорії для моделі",
    });
    expect(within(chips).getAllByRole("link").map(href)).toEqual([
      "/icons/categories.svg#cat-cases",
      "/icons/categories.svg#cat-folder",
      "/icons/categories.svg#cat-folder",
    ]);
    expect(href(screen.getByRole("region", { name: "Чохли" }))).toBe(
      "/icons/categories.svg#cat-cases",
    );
    expect(href(screen.getByRole("region", { name: "Кабелі" }))).toBe(
      "/icons/categories.svg#cat-folder",
    );
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

  it("shows the neutral kicker and links «Пристрої» to /devices", () => {
    render(<DeviceHubView hub={hub} siblings={[]} />);
    expect(screen.getByText("Apple · iPhone 15")).toBeInTheDocument();
    const crumbs = screen.getByRole("navigation", {
      name: "Навігаційний ланцюжок",
    });
    // TASK-2076 shipped the «Мої пристрої» page the crumb points at.
    const devices = within(crumbs).getByRole("link", { name: "Пристрої" });
    expect(devices).toHaveAttribute("href", "/devices");
    expect(devices).not.toHaveAttribute("aria-current");
    expect(within(crumbs).getByText("Все для iPhone 15 Pro")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
