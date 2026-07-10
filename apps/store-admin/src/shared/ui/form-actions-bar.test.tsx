import { render, screen } from "@/shared/test/render";
import { FormActionsBar } from "./form-actions-bar";
import { Button } from "./button";

describe("FormActionsBar (TASK-258)", () => {
  it("renders its children (submit button stays queryable by role)", () => {
    render(
      <FormActionsBar>
        <Button type="submit">Зберегти</Button>
      </FormActionsBar>,
    );
    expect(
      screen.getByRole("button", { name: "Зберегти" }),
    ).toBeInTheDocument();
  });

  it("is sticky bottom-0 below md and static above (max-md: classes only)", () => {
    const { container } = render(<FormActionsBar />);
    const bar = container.querySelector(
      '[data-slot="form-actions-bar"]',
    ) as HTMLElement;
    expect(bar).toHaveClass("max-md:sticky", "max-md:bottom-0");
    // No unprefixed positioning class — desktop rendering is unchanged.
    const unprefixed = bar.className
      .split(" ")
      .filter((c) => !c.includes("max-md:"));
    expect(unprefixed).toEqual([]);
  });

  it("merges a call-site className (e.g. flex alignment)", () => {
    const { container } = render(
      <FormActionsBar className="flex justify-end gap-2" />,
    );
    expect(
      container.querySelector('[data-slot="form-actions-bar"]'),
    ).toHaveClass("flex", "justify-end", "gap-2");
  });
});
