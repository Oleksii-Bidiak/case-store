import { useState } from "react";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { ProductControllerFindAllParams } from "@/entities/product";
import { ProductFilters } from "./product-filters";

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

  return (
    <ProductFilters
      categories={[]}
      currentParams={params}
      onFilterChange={apply}
    />
  );
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
        categories={[]}
        currentParams={{ minPrice: 1000, maxPrice: 5000 }}
        onFilterChange={onFilterChange}
      />,
    );
    expect(minInput()).toHaveValue(1000);
    expect(maxInput()).toHaveValue(5000);

    // Simulates "Clear filters" / back-forward: the URL drops both bounds.
    rerender(
      <ProductFilters
        categories={[]}
        currentParams={{}}
        onFilterChange={onFilterChange}
      />,
    );

    expect(minInput()).toHaveValue(null);
    expect(maxInput()).toHaveValue(null);
    expect(minThumb()).toHaveAttribute("aria-valuenow", "0");
    expect(maxThumb()).toHaveAttribute("aria-valuenow", "100000");
    expect(onFilterChange).not.toHaveBeenCalled();
  });
});
