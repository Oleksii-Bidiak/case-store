import { render, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { FiltersButton } from "./filters-button";

/**
 * TASK-876 — one «Фільтри» button for the catalogue and /search, which used to
 * hand-copy it and drifted apart.
 */
describe("FiltersButton", () => {
  it("is a 44px, mobile-only button that keeps its size beside the sort pill", () => {
    render(<FiltersButton activeCount={0} onClick={jest.fn()} />);

    const button = screen.getByRole("button", {
      name: dict.filters.filtersButton,
    });
    expect(button).toHaveClass("h-11", "shrink-0", "lg:hidden");
    // The house focus outline (TASK-2079) — never `outline-none`, which the
    // focus-visible outline would inherit as its style.
    expect(button).toHaveClass("focus-visible:outline-2");
    expect(button).not.toHaveClass("outline-none");
  });

  it("badges the active filter count only when there is one", () => {
    const { rerender } = render(
      <FiltersButton activeCount={0} onClick={jest.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: dict.filters.filtersButton }),
    ).toHaveTextContent(new RegExp(`^${dict.filters.filtersButton}$`));

    rerender(<FiltersButton activeCount={3} onClick={jest.fn()} />);
    expect(screen.getByRole("button", { name: /^Фільтри/ })).toHaveTextContent(
      `${dict.filters.filtersButton}3`,
    );
  });

  it("opens the drawer on click", async () => {
    const onClick = jest.fn();
    render(<FiltersButton activeCount={0} onClick={onClick} />);

    await userEvent.click(
      screen.getByRole("button", { name: dict.filters.filtersButton }),
    );

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
