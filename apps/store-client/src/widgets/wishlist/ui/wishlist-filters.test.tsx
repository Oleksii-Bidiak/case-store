import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { WishlistItemEntity } from "@/entities/wishlist";
import {
  WishlistFilters,
  EMPTY_WISHLIST_FILTERS,
  type WishlistFilterState,
} from "./wishlist-filters";

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

function renderFilters(
  value: WishlistFilterState,
  { collapsible = false } = {},
) {
  return renderWithProviders(
    <WishlistFilters
      items={items}
      value={value}
      onChange={() => {}}
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
    // Order: [0] quick filters, [1] price.
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
      { ...EMPTY_WISHLIST_FILTERS, minPrice: "100" },
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
