import { useState } from "react";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { FiltersDrawer } from "./filters-drawer";

function Harness({
  resultCount,
  onReset = jest.fn(),
  resetLabel,
}: {
  resultCount: number | undefined;
  onReset?: () => void;
  resetLabel?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <p>{open ? "drawer open" : "drawer closed"}</p>
      <FiltersDrawer
        open={open}
        onOpenChange={setOpen}
        resultCount={resultCount}
        onReset={onReset}
        resetLabel={resetLabel}
      >
        <p>panel</p>
      </FiltersDrawer>
    </>
  );
}

/**
 * TASK-804 — one drawer for the catalogue, /search and the wishlist, whose
 * footer always offers a working action.
 */
describe("FiltersDrawer (TASK-804)", () => {
  it("renders the panel under the «Фільтри» title", () => {
    renderWithProviders(<Harness resultCount={3} />);

    expect(
      screen.getByRole("dialog", { name: dict.filters.legend }),
    ).toBeInTheDocument();
    expect(screen.getByText("panel")).toBeInTheDocument();
  });

  it("closes onto the results with «Показати N товарів»", async () => {
    renderWithProviders(<Harness resultCount={3} />);

    await userEvent.click(
      screen.getByRole("button", { name: dict.filters.mobileApply(3) }),
    );

    expect(await screen.findByText("drawer closed")).toBeInTheDocument();
  });

  it("shows «Рахуємо…» while the first count is in flight", () => {
    renderWithProviders(<Harness resultCount={undefined} />);

    expect(
      screen.getByRole("button", { name: dict.filters.mobileApplyPending }),
    ).toBeEnabled();
  });

  it("offers a WORKING reset at zero results and stays open", async () => {
    const onReset = jest.fn();
    renderWithProviders(<Harness resultCount={0} onReset={onReset} />);

    // The «nothing matches» line is still said…
    expect(screen.getByText(dict.filters.mobileApply(0))).toBeInTheDocument();
    // …but the action under it is not a disabled dead end.
    const reset = screen.getByRole("button", { name: dict.filters.clear });
    expect(reset).toBeEnabled();

    await userEvent.click(reset);

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText("drawer open")).toBeInTheDocument();
  });

  it("uses the consumer's own reset label", () => {
    renderWithProviders(
      <Harness resultCount={0} resetLabel={dict.catalog.clearAllFilters} />,
    );

    expect(
      screen.getByRole("button", { name: dict.catalog.clearAllFilters }),
    ).toBeInTheDocument();
  });

  it("keeps ONE footer button, so focus survives the count changing", () => {
    const { rerender } = renderWithProviders(<Harness resultCount={0} />);
    const before = screen.getByRole("button", { name: dict.filters.clear });

    rerender(<Harness resultCount={2} />);

    expect(
      screen.getByRole("button", { name: dict.filters.mobileApply(2) }),
    ).toBe(before);
  });
});
