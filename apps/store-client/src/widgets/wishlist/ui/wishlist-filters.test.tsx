import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { WishlistItemEntity } from "@/entities/wishlist";
import { WishlistFilters } from "./wishlist-filters";
import {
  EMPTY_WISHLIST_FILTERS,
  type FacetOption,
  type WishlistFilterState,
} from "../model/wishlist-catalog";

function buildItem(
  overrides: Partial<WishlistItemEntity> = {},
): WishlistItemEntity {
  return {
    id: "i1",
    productId: "p1",
    productName: "iPhone 15 Pro Case",
    productSlug: "iphone-15-pro-case",
    imageUrl: null,
    price: "29.99",
    compareAtPrice: null,
    maxQty: 10,
    isActive: true,
    createdAt: "2026-06-30T00:00:00.000Z",
    ...overrides,
  };
}

const items = [buildItem()];

const SEVEN_CATEGORIES: FacetOption[] = [
  "Чохли",
  "Кабелі",
  "Зарядні пристрої",
  "Навушники",
  "Скло",
  "Тримачі",
  "Павербанки",
].map((label, index) => ({ id: `c${index}`, label, count: 7 - index }));

const BRANDS: FacetOption[] = [
  { id: "b-apple", label: "Apple", count: 3 },
  { id: "b-anker", label: "Anker", count: 1 },
];

function renderFilters(
  value: WishlistFilterState,
  {
    collapsible = false,
    categoryOptions = [] as FacetOption[],
    brandOptions = [] as FacetOption[],
    onChange = jest.fn(),
  } = {},
) {
  return renderWithProviders(
    <WishlistFilters
      items={items}
      categoryOptions={categoryOptions}
      brandOptions={brandOptions}
      priceDomain={18000}
      value={value}
      onChange={onChange}
      collapsible={collapsible}
    />,
  );
}

describe("WishlistFilters collapsible sections (TASK-290)", () => {
  it("renders no <details> disclosures in the default (desktop) layout", () => {
    const { container } = renderFilters(EMPTY_WISHLIST_FILTERS);

    expect(container.querySelectorAll("details")).toHaveLength(0);
    // Section headings still render as plain, always-expanded cards.
    expect(
      screen.getByRole("heading", { name: dict.wishlist.quickTitle }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: dict.filters.priceTitle }),
    ).toBeInTheDocument();
  });

  it("wraps each section in a <details>, collapsed when no filter is active", () => {
    const { container } = renderFilters(EMPTY_WISHLIST_FILTERS, {
      collapsible: true,
    });

    const sections = container.querySelectorAll("details");
    // Order: [0] quick filters, [1] price (no category/brand values here).
    expect(sections).toHaveLength(2);
    expect(sections[0]).not.toHaveAttribute("open");
    expect(sections[1]).not.toHaveAttribute("open");
  });

  it("opens the quick-filters section (and not price) when a quick filter is active", () => {
    const { container } = renderFilters(
      { ...EMPTY_WISHLIST_FILTERS, saleOnly: true },
      { collapsible: true },
    );

    const sections = container.querySelectorAll("details");
    expect(sections[0]).toHaveAttribute("open");
    expect(sections[1]).not.toHaveAttribute("open");
  });

  it("opens the price section (and not quick filters) when a price bound is active", () => {
    const { container } = renderFilters(
      { ...EMPTY_WISHLIST_FILTERS, minPrice: 100 },
      { collapsible: true },
    );

    const sections = container.querySelectorAll("details");
    expect(sections[0]).not.toHaveAttribute("open");
    expect(sections[1]).toHaveAttribute("open");
  });

  it("labels each section's disclosure as a focusable toggle with its title (a11y)", () => {
    renderFilters(EMPTY_WISHLIST_FILTERS, { collapsible: true });

    const quickToggle = screen.getByLabelText(
      dict.filters.sectionToggleAria(dict.wishlist.quickTitle),
    );
    const priceToggle = screen.getByLabelText(
      dict.filters.sectionToggleAria(dict.filters.priceTitle),
    );

    // Native <details>/<summary> disclosure: the <summary> is the button-like
    // heading, keyboard-operable and announcing expanded state to assistive tech,
    // with the content natively associated to it — the same accessible primitive
    // the catalog filter drawer reuses (TASK-084).
    expect(quickToggle.tagName).toBe("SUMMARY");
    expect(priceToggle.tagName).toBe("SUMMARY");
    expect(quickToggle.closest("details")).toContainElement(
      screen.getByText(dict.wishlist.quickSale),
    );
  });
});

// ── TASK-1300: the rail as on /products ─────────────────────────────────────
describe("WishlistFilters catalogue rail (TASK-1300)", () => {
  it("renders category and brand sections only when the list has values for them", () => {
    const { unmount } = renderFilters(EMPTY_WISHLIST_FILTERS);
    expect(
      screen.queryByRole("heading", { name: dict.wishlist.categoryTitle }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: dict.filters.brandTitle }),
    ).not.toBeInTheDocument();
    unmount();

    renderFilters(EMPTY_WISHLIST_FILTERS, {
      categoryOptions: SEVEN_CATEGORIES,
      brandOptions: BRANDS,
    });
    expect(
      screen.getByRole("heading", { name: dict.wishlist.categoryTitle }),
    ).toBeInTheDocument();
    // The count joins the checkbox's accessible name («Apple, 3 товари»).
    expect(
      screen.getByRole("checkbox", {
        name: `Apple ${dict.filters.facetCountAria(3)}`,
      }),
    ).toBeInTheDocument();
  });

  it("folds categories past five behind a «Показати всі (N)» disclosure", async () => {
    const user = userEvent.setup();
    renderFilters(EMPTY_WISHLIST_FILTERS, {
      categoryOptions: SEVEN_CATEGORIES,
    });

    expect(
      screen.queryByRole("checkbox", { name: /Тримачі/ }),
    ).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", {
      name: dict.wishlist.showAllFacets(7),
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(screen.getByRole("checkbox", { name: /Тримачі/ })).toBeVisible();
    expect(
      screen.getByRole("button", { name: dict.wishlist.showFewerFacets }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("never folds away a ticked category", () => {
    renderFilters(
      { ...EMPTY_WISHLIST_FILTERS, categoryIds: ["c6"] },
      { categoryOptions: SEVEN_CATEGORIES },
    );

    // «Павербанки» is the 7th row, but it is ticked — so it stays in view.
    expect(screen.getByRole("checkbox", { name: /Павербанки/ })).toBeChecked();
    expect(
      screen.queryByRole("checkbox", { name: /Тримачі/ }),
    ).not.toBeInTheDocument();
  });

  it("adds a brand to the selection when its box is ticked", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    renderFilters(EMPTY_WISHLIST_FILTERS, { brandOptions: BRANDS, onChange });

    await user.click(screen.getByRole("checkbox", { name: /Anker/ }));

    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_WISHLIST_FILTERS,
      brandIds: ["b-anker"],
    });
  });

  it("offers a working two-thumb price slider over the list's own domain", () => {
    renderFilters({ ...EMPTY_WISHLIST_FILTERS, minPrice: 500 });

    const minThumb = screen.getByRole("slider", {
      name: dict.filters.minPrice,
    });
    const maxThumb = screen.getByRole("slider", {
      name: dict.filters.maxPrice,
    });
    expect(minThumb).toHaveAttribute("aria-valuenow", "500");
    // No upper bound set → the thumb sits on the domain edge (18 000 ₴), not
    // on the catalogue's 100 000 ₴.
    expect(maxThumb).toHaveAttribute("aria-valuemax", "18000");
    expect(maxThumb).toHaveAttribute("aria-valuenow", "18000");
  });
});
