import { render, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { ViewToggle } from "./view-toggle";

/**
 * TASK-1958 — one pill that offers the OTHER view, at every width. Below `sm`
 * it is icon-only, so the accessible name must carry the whole action.
 */
describe("ViewToggle", () => {
  it("offers the list while the grid is shown", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<ViewToggle view="grid" onChange={onChange} />);

    const button = screen.getByRole("button", {
      name: dict.filters.viewListAria,
    });
    // The visible word is part of the accessible name (label-in-name).
    expect(dict.filters.viewListAria.toLowerCase()).toContain(
      dict.filters.viewList.toLowerCase(),
    );
    expect(button).toHaveTextContent(dict.filters.viewList);
    // Not a pressed toggle: the label already names the state change.
    expect(button).not.toHaveAttribute("aria-pressed");

    await user.click(button);
    expect(onChange).toHaveBeenCalledWith("list");
  });

  it("offers the grid while the list is shown", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<ViewToggle view="list" onChange={onChange} />);

    const button = screen.getByRole("button", {
      name: dict.filters.viewGridAria,
    });
    expect(button).toHaveTextContent(dict.filters.viewGrid);

    await user.click(button);
    expect(onChange).toHaveBeenCalledWith("grid");
  });

  it("is never hidden by itself and drops only its word below sm", () => {
    render(<ViewToggle view="grid" onChange={jest.fn()} />);

    const button = screen.getByRole("button", {
      name: dict.filters.viewListAria,
    });
    expect(button).not.toHaveClass("hidden");
    // A 44px touch target even when icon-only.
    expect(button).toHaveClass("h-11", "min-w-11");
    expect(screen.getByText(dict.filters.viewList)).toHaveClass(
      "hidden",
      "sm:inline",
    );
  });
});
