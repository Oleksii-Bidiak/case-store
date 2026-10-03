import { useState } from "react";
import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { ProductControllerFindAllParams } from "@/entities/product";
import {
  filterRailSections,
  type FilterSectionId,
} from "../model/filter-sections";
import { ProductFilters } from "./product-filters";

// ProductFilters now renders the «Виробник» BrandFilter, which fetches
// GET /brands (TASK-189). Stub it empty so the control is hidden and these
// price-focused tests stay deterministic under onUnhandledRequest: "error".
beforeEach(() => {
  server.use(
    http.get("*/api/brands", () => HttpResponse.json({ data: [] })),
    // DeviceModelFilter fetches the brand→model cascade in every layout, not
    // only the collapsible one; stubbed empty so it renders two empty selects
    // and these tests stay free of unhandled-request noise.
    http.get("*/api/device-brands", () => HttpResponse.json({ data: [] })),
    http.get("*/api/device-models", () => HttpResponse.json({ data: [] })),
  );
});

/**
 * Mirrors the real URL round-trip of `ProductListView.applyFilters`: price
 * updates pushed via `onFilterChange` are parsed back into numbers and fed
 * into `currentParams`, exactly as `router.replace` → `useSearchParams` does
 * in production. Only the price keys matter for these tests.
 */
function Harness({
  onFilterChange = () => {},
  initialParams = {},
}: {
  onFilterChange?: (updates: Record<string, string | undefined>) => void;
  initialParams?: ProductControllerFindAllParams;
}) {
  const [params, setParams] =
    useState<ProductControllerFindAllParams>(initialParams);

  const apply = (updates: Record<string, string | undefined>) => {
    onFilterChange(updates);
    setParams((prev) => {
      const next = { ...prev };
      if ("minPrice" in updates) {
        next.minPrice = updates.minPrice ? Number(updates.minPrice) : undefined;
      }
      if ("maxPrice" in updates) {
        next.maxPrice = updates.maxPrice ? Number(updates.maxPrice) : undefined;
      }
      return next;
    });
  };

  return <ProductFilters currentParams={params} onFilterChange={apply} />;
}

const minInput = () =>
  screen.getByRole("spinbutton", { name: dict.filters.minPrice });
const maxInput = () =>
  screen.getByRole("spinbutton", { name: dict.filters.maxPrice });
const minThumb = () =>
  screen.getByRole("slider", { name: dict.filters.minPrice });
const maxThumb = () =>
  screen.getByRole("slider", { name: dict.filters.maxPrice });

describe("ProductFilters price range sync (TASK-208)", () => {
  it("moves the slider thumb when a min price is typed and committed on blur", async () => {
    const user = userEvent.setup();
    const onFilterChange = jest.fn();
    renderWithProviders(<Harness onFilterChange={onFilterChange} />);

    await user.type(minInput(), "20000");
    // Typing alone does not commit — the slider follows on blur.
    expect(minThumb()).toHaveAttribute("aria-valuenow", "0");

    await user.tab();

    expect(minThumb()).toHaveAttribute("aria-valuenow", "20000");
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({
      minPrice: "20000",
      maxPrice: undefined,
    });
  });

  it("mirrors keyboard slider movement into the min input live", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    minThumb().focus();
    await user.keyboard("{ArrowRight}");

    // One step = 100; the input reflects the thumb without any URL round-trip.
    expect(minThumb()).toHaveAttribute("aria-valuenow", "100");
    expect(minInput()).toHaveValue(100);
  });

  it("clamps an inverted typed min down to the max bound on commit", async () => {
    const user = userEvent.setup();
    const onFilterChange = jest.fn();
    renderWithProviders(
      <Harness
        onFilterChange={onFilterChange}
        initialParams={{ maxPrice: 2000 }}
      />,
    );

    await user.type(minInput(), "8000");
    await user.tab();

    expect(minInput()).toHaveValue(2000);
    expect(minThumb()).toHaveAttribute("aria-valuenow", "2000");
    expect(maxThumb()).toHaveAttribute("aria-valuenow", "2000");
    expect(onFilterChange).toHaveBeenCalledWith({
      minPrice: "2000",
      maxPrice: "2000",
    });
  });

  it("keeps focus in the max input when blurring min commits to the URL (no key-remount)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.type(minInput(), "500");
    await user.tab(); // blur commits min → parent re-renders with the URL echo

    expect(maxInput()).toHaveFocus();
    expect(minInput()).toHaveValue(500);
  });

  it("re-seeds inputs and slider on an external params reset (clear filters)", async () => {
    const onFilterChange = jest.fn();
    const { rerender } = renderWithProviders(
      <ProductFilters
        currentParams={{ minPrice: 1000, maxPrice: 5000 }}
        onFilterChange={onFilterChange}
      />,
    );
    expect(minInput()).toHaveValue(1000);
    expect(maxInput()).toHaveValue(5000);

    // Simulates "Clear filters" / back-forward: the URL drops both bounds.
    rerender(
      <ProductFilters currentParams={{}} onFilterChange={onFilterChange} />,
    );

    expect(minInput()).toHaveValue(null);
    expect(maxInput()).toHaveValue(null);
    expect(minThumb()).toHaveAttribute("aria-valuenow", "0");
    expect(maxThumb()).toHaveAttribute("aria-valuenow", "100000");
    expect(onFilterChange).not.toHaveBeenCalled();
  });
});

describe("ProductFilters collapsible mobile drawer (TASK-084)", () => {
  it("renders no <details> disclosures in the default (desktop) layout", () => {
    const { container } = renderWithProviders(
      <ProductFilters currentParams={{}} onFilterChange={() => {}} />,
    );
    expect(container.querySelectorAll("details")).toHaveLength(0);
  });

  it("wraps each section in a <details>, open only where a filter is active", async () => {
    const { container } = renderWithProviders(
      <ProductFilters
        collapsible
        currentParams={{ search: "case" }}
        onFilterChange={() => {}}
      />,
    );

    // The device summary appears only in the collapsible layout — awaiting it
    // also flushes the (empty) brand presence query so the section count is stable.
    await screen.findByText(dict.filters.deviceTitle);

    // Brands are stubbed empty and no category is set, so brand + specs self-hide;
    // the five rendered disclosures are search / availability / sale / device /
    // price in DOM order (availability added by TASK-414, sale by TASK-742).
    const sections = container.querySelectorAll("details");
    expect(sections).toHaveLength(5);
    // Search carries the active value → open; the rest start collapsed.
    expect(sections[0]).toHaveAttribute("open");
    expect(sections[1]).not.toHaveAttribute("open");
    expect(sections[2]).not.toHaveAttribute("open");
    expect(sections[3]).not.toHaveAttribute("open");
    expect(sections[4]).not.toHaveAttribute("open");
  });

  it("opens the price section (and not search) when only a price bound is active", async () => {
    const { container } = renderWithProviders(
      <ProductFilters
        collapsible
        currentParams={{ minPrice: 500 }}
        onFilterChange={() => {}}
      />,
    );

    await screen.findByText(dict.filters.deviceTitle);

    const sections = container.querySelectorAll("details");
    // Order: [0] search, [1] availability, [2] sale, [3] device, [4] price.
    expect(sections[0]).not.toHaveAttribute("open");
    expect(sections[4]).toHaveAttribute("open");
  });

  it("opens the availability section when the in-stock filter is on", async () => {
    const { container } = renderWithProviders(
      <ProductFilters
        collapsible
        currentParams={{ inStock: true }}
        onFilterChange={() => {}}
      />,
    );

    await screen.findByText(dict.filters.deviceTitle);

    expect(container.querySelectorAll("details")[1]).toHaveAttribute("open");
  });
});

/**
 * TASK-414 — the availability filter and the ONE reset set.
 */
describe("ProductFilters — availability + reset (TASK-414)", () => {
  it("writes ?inStock=true when the checkbox is ticked", async () => {
    const user = userEvent.setup();
    const onFilterChange = jest.fn();

    renderWithProviders(
      <ProductFilters currentParams={{}} onFilterChange={onFilterChange} />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: dict.filters.inStockOnly }),
    );

    expect(onFilterChange).toHaveBeenCalledWith({ inStock: "true" });
  });

  // Absent, not `false`: an unused filter must never show up in a shared link,
  // and on the API side `inStock=false` is a no-op anyway.
  it("REMOVES the param when the checkbox is unticked", async () => {
    const user = userEvent.setup();
    const onFilterChange = jest.fn();

    renderWithProviders(
      <ProductFilters
        currentParams={{ inStock: true }}
        onFilterChange={onFilterChange}
      />,
    );

    const checkbox = screen.getByRole("checkbox", {
      name: dict.filters.inStockOnly,
    });
    expect(checkbox).toBeChecked();

    await user.click(checkbox);

    expect(onFilterChange).toHaveBeenCalledWith({ inStock: undefined });
  });

  // The defect this replaces: the button appeared for {search, brandId,
  // minPrice, maxPrice} only, and cleared exactly those — a device, spec or
  // availability selection stayed applied while the button vanished.
  it("offers the reset button for a filter the old set did not know about", async () => {
    renderWithProviders(
      <ProductFilters
        currentParams={{ specs: "material:Силікон" }}
        onFilterChange={jest.fn()}
      />,
    );

    expect(
      await screen.findByRole("button", { name: dict.filters.clear }),
    ).toBeInTheDocument();
  });

  it("hides the reset button when only the category (owned by the chips row) is set", () => {
    renderWithProviders(
      <ProductFilters
        currentParams={{ category: "phone-cases" }}
        onFilterChange={jest.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: dict.filters.clear }),
    ).not.toBeInTheDocument();
  });

  it("clears EVERY panel filter at once, category excepted", async () => {
    const user = userEvent.setup();
    const onFilterChange = jest.fn();

    renderWithProviders(
      <ProductFilters
        currentParams={{
          category: "phone-cases",
          search: "чохол",
          brand: "apple",
          device: "iphone-15",
          minPrice: 100,
          maxPrice: 900,
          specs: "material:Силікон",
          inStock: true,
          onSale: true,
        }}
        onFilterChange={onFilterChange}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: dict.filters.clear }),
    );

    const updates = onFilterChange.mock.calls.at(-1)![0];
    expect(updates).toEqual({
      search: undefined,
      brand: undefined,
      device: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      specs: undefined,
      inStock: undefined,
      onSale: undefined,
    });
    // The category's control is the chips row / the route, not this panel.
    expect("category" in updates).toBe(false);
  });
});

/**
 * TASK-742 — «Зі знижкою». The API understood `?onSale=true` all along; the
 * panel had no control for it.
 */
describe("ProductFilters — on sale (TASK-742)", () => {
  it("writes ?onSale=true when the checkbox is ticked", async () => {
    const user = userEvent.setup();
    const onFilterChange = jest.fn();

    renderWithProviders(
      <ProductFilters currentParams={{}} onFilterChange={onFilterChange} />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: dict.filters.onSaleOnly }),
    );

    expect(onFilterChange).toHaveBeenCalledWith({ onSale: "true" });
  });

  it("REMOVES the param when the checkbox is unticked", async () => {
    const user = userEvent.setup();
    const onFilterChange = jest.fn();

    renderWithProviders(
      <ProductFilters
        currentParams={{ onSale: true }}
        onFilterChange={onFilterChange}
      />,
    );

    const checkbox = screen.getByRole("checkbox", {
      name: dict.filters.onSaleOnly,
    });
    expect(checkbox).toBeChecked();
    await user.click(checkbox);

    expect(onFilterChange).toHaveBeenCalledWith({ onSale: undefined });
  });

  it("offers the reset button when only «Зі знижкою» is on", async () => {
    renderWithProviders(
      <ProductFilters
        currentParams={{ onSale: true }}
        onFilterChange={jest.fn()}
      />,
    );

    expect(
      await screen.findByRole("button", { name: dict.filters.clear }),
    ).toBeInTheDocument();
  });

  it("opens the sale section of the drawer when the filter is on", async () => {
    const { container } = renderWithProviders(
      <ProductFilters
        collapsible
        currentParams={{ onSale: true }}
        onFilterChange={() => {}}
      />,
    );

    await screen.findByText(dict.filters.deviceTitle);

    expect(container.querySelectorAll("details")[2]).toHaveAttribute("open");
  });

  // `/search` has no `onSale` param — a box there would do nothing.
  it("is left out entirely with hideOnSale", () => {
    renderWithProviders(
      <ProductFilters
        currentParams={{}}
        onFilterChange={jest.fn()}
        hideOnSale
      />,
    );

    expect(
      screen.queryByRole("checkbox", { name: dict.filters.onSaleOnly }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(dict.filters.saleTitle)).not.toBeInTheDocument();
  });
});

/**
 * TASK-523 — `/search` passes a category (brand scope) but its endpoint has no
 * `?specs=`, so the category-scoped spec facets must stay out of the panel.
 */
describe("ProductFilters — hideSpecFacets (TASK-523)", () => {
  const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
  let facetCalls = 0;

  beforeEach(() => {
    facetCalls = 0;
    server.use(
      http.get("*/api/categories/:id/filterable-specs", () => {
        facetCalls += 1;
        return HttpResponse.json({
          data: [
            {
              definition: {
                id: "def-material",
                categoryId: CATEGORY_ID,
                key: "material",
                label: "Матеріал",
                type: "SELECT",
                unit: null,
                options: ["Силікон"],
                isFilterable: true,
                sortOrder: 0,
              },
              values: [{ value: "Силікон", count: 3 }],
            },
          ],
        });
      }),
    );
  });

  it("shows the spec facets for a category by default", async () => {
    renderWithProviders(
      <ProductFilters
        currentParams={{}}
        categoryId={CATEGORY_ID}
        onFilterChange={jest.fn()}
      />,
    );

    expect(await screen.findByText(dict.filters.specsTitle)).toBeVisible();
  });

  /**
   * TASK-515 — the catalogue skeleton draws its placeholder rail from
   * `filterRailSections`; the real rail must render those very sections, in
   * that order, or skeleton → content jumps again.
   */
  it.each([
    ["the default /products rail", {}],
    ["a category rail", { categoryId: CATEGORY_ID }],
    [
      "a locked-device landing rail",
      { categoryId: CATEGORY_ID, lockedDevice: true },
    ],
    [
      "the /search rail",
      { categoryId: CATEGORY_ID, hideOnSale: true, hideSpecFacets: true },
    ],
    ["the /promo rail", { lockedOnSale: true }],
  ] as const)(
    "renders the section cards of %s in filterRailSections order",
    async (_label, props) => {
      server.use(
        http.get("*/api/brands", () =>
          HttpResponse.json({
            data: [{ id: "b-1", name: "Apple", slug: "apple" }],
          }),
        ),
      );
      const titleOf: Record<FilterSectionId, string | null> = {
        search: null, // the keyword card has no heading on desktop
        availability: dict.filters.availabilityTitle,
        onSale: dict.filters.saleTitle,
        brand: dict.filters.brandTitle,
        device: dict.filters.deviceTitle,
        price: dict.filters.priceTitle,
        specs: dict.filters.specsTitle,
      };
      const expected = filterRailSections({
        lockedDevice: "lockedDevice" in props && props.lockedDevice,
        hideOnSale: "hideOnSale" in props && props.hideOnSale,
        lockedOnSale: "lockedOnSale" in props && props.lockedOnSale,
        hideSpecFacets: "hideSpecFacets" in props && props.hideSpecFacets,
        hasCategory: "categoryId" in props,
      })
        .map((section) => titleOf[section])
        .filter((title): title is string => title !== null);

      const { container } = renderWithProviders(
        <ProductFilters
          currentParams={{}}
          onFilterChange={jest.fn()}
          {...props}
        />,
      );

      // The two data-driven cards appear last; wait for whichever is expected.
      await screen.findByText(dict.filters.brandTitle);
      if (expected.includes(dict.filters.specsTitle)) {
        await screen.findByText(dict.filters.specsTitle);
      }

      const rendered = [...container.querySelectorAll("h3")].map(
        (heading) => heading.textContent,
      );
      expect(rendered).toEqual(expected);
    },
  );

  it.each([
    ["the sidebar", false],
    ["the drawer", true],
  ])(
    "leaves them out of %s with hideSpecFacets — and never asks for them",
    async (_label, collapsible) => {
      renderWithProviders(
        <ProductFilters
          currentParams={{}}
          categoryId={CATEGORY_ID}
          onFilterChange={jest.fn()}
          collapsible={collapsible}
          hideSpecFacets
        />,
      );

      // Let every enabled query settle before asserting on absence.
      await screen.findByText(dict.filters.deviceTitle);
      expect(
        screen.queryByText(dict.filters.specsTitle),
      ).not.toBeInTheDocument();
      expect(facetCalls).toBe(0);
    },
  );
});

/**
 * TASK-515 — `GET /brands` is not in the server-rendered page, so «Виробник»
 * used to render nothing until it answered: right after the skeleton swap the
 * rail was a card short and the device and price cards jumped up, then back.
 */
describe("ProductFilters — «Виробник» holds its place (TASK-515)", () => {
  const sectionsInRail = (root: HTMLElement) =>
    [...root.querySelectorAll("[data-section]")].map((node) =>
      node.getAttribute("data-section"),
    );

  it("keeps the brand card's box in the sidebar until the brand list is in", async () => {
    server.use(
      http.get("*/api/brands", () =>
        HttpResponse.json({
          data: [{ id: "b-1", name: "Apple", slug: "apple" }],
        }),
      ),
    );

    const { container } = renderWithProviders(
      <ProductFilters currentParams={{}} onFilterChange={jest.fn()} />,
    );

    // Between «Знижки» and «Сумісний пристрій» — where the card will land.
    expect(sectionsInRail(container)).toEqual(["brand"]);
    const placeholder = container.querySelector('[data-section="brand"]');
    expect(placeholder?.previousElementSibling).toHaveTextContent(
      dict.filters.onSaleOnly,
    );

    await screen.findByText(dict.filters.brandTitle);
    expect(sectionsInRail(container)).toEqual([]);
  });

  it("gives the box up when there turn out to be no brands", async () => {
    const { container } = renderWithProviders(
      <ProductFilters currentParams={{}} onFilterChange={jest.fn()} />,
    );

    expect(sectionsInRail(container)).toEqual(["brand"]);
    await screen.findByText(dict.filters.deviceTitle);
    await screen.findByText(dict.filters.priceTitle);
    await waitFor(() => expect(sectionsInRail(container)).toEqual([]));
    expect(screen.queryByText(dict.filters.brandTitle)).not.toBeInTheDocument();
  });

  it("draws no placeholder box in the drawer, whose disclosures gate on data", () => {
    const { container } = renderWithProviders(
      <ProductFilters
        collapsible
        currentParams={{}}
        onFilterChange={jest.fn()}
      />,
    );

    expect(sectionsInRail(container)).toEqual([]);
  });
});
