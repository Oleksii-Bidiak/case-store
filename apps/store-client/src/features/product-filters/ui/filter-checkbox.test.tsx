import { render, screen } from "@testing-library/react";
import { FilterCheckbox } from "./filter-checkbox";

/** The painted box next to the native (sr-only) input. */
function box(label: string) {
  const input = screen.getByRole("checkbox", { name: new RegExp(label) });
  return input.nextElementSibling as HTMLElement;
}

/**
 * TASK-2079 — the checkbox states (design-system §6): the unchecked edge is
 * `input` (3.65:1 on the card; `border` was 1.39:1), the box is square, not
 * the circle `rounded-md` drew, and disabled reads through tokens.
 */
describe("FilterCheckbox states (TASK-2079)", () => {
  it("draws an unchecked square box with a visible edge", () => {
    render(
      <FilterCheckbox
        checked={false}
        onCheckedChange={jest.fn()}
        label="Spigen"
      />,
    );
    expect(box("Spigen")).toHaveClass("border-input", "rounded-xs");
    expect(box("Spigen")).not.toHaveClass("border-border", "rounded-md");
  });

  it("fills a checked box graphite and hovers it to primary-hover", () => {
    render(
      <FilterCheckbox checked onCheckedChange={jest.fn()} label="Spigen" />,
    );
    expect(box("Spigen")).toHaveClass(
      "bg-primary",
      "group-hover:bg-primary-hover",
    );
  });

  it("greys a disabled box out with tokens and drops the row's hover", () => {
    render(
      <FilterCheckbox
        checked
        disabled
        onCheckedChange={jest.fn()}
        label="Nillkin"
      />,
    );
    expect(box("Nillkin")).toHaveClass("bg-disabled", "border-transparent");
    expect(box("Nillkin").closest("label")).not.toHaveClass("group");
  });
});
