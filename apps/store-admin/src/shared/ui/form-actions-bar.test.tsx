import { render, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
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

  it("leaves the default variant without the sticky bar's chrome", () => {
    const { container } = render(<FormActionsBar />);
    expect(
      container.querySelector('[data-slot="form-actions-bar"]'),
    ).not.toHaveAttribute("data-variant", "sticky");
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

/**
 * Wave 198 — the sticky bar of a long form (Product Ф1, Category КТ5): one
 * «Зберегти» for the whole form, pinned to the bottom of the scrolling `<main>`
 * at every width, telling the operator WHICH sections have unsaved changes.
 */
describe("FormActionsBar — sticky variant", () => {
  it("lists the dirty sections and offers discard + save", async () => {
    const onDiscard = jest.fn();
    const user = userEvent.setup();
    const { container } = render(
      <form id="product-form">
        <FormActionsBar
          variant="sticky"
          dirtySections={["Основне", "Характеристики", "Сумісність"]}
          onDiscard={onDiscard}
          saveLabel="Зберегти"
          formId="product-form"
        />
      </form>,
    );
    const bar = container.querySelector(
      '[data-slot="form-actions-bar"]',
    ) as HTMLElement;
    expect(bar).toHaveAttribute("data-variant", "sticky");
    expect(bar).toHaveClass("sticky");
    expect(bar).toHaveTextContent(
      dict.canon.unsavedChanges("Основне, Характеристики, Сумісність"),
    );

    await user.click(
      screen.getByRole("button", { name: dict.canon.discardChanges }),
    );
    expect(onDiscard).toHaveBeenCalled();

    const save = screen.getByRole("button", { name: "Зберегти" });
    expect(save).toHaveAttribute("type", "submit");
    expect(save).toHaveAttribute("form", "product-form");
  });

  // TASK-1993. A sticky edge is inset by the scroll container's padding, so
  // `bottom-0` left the bar 16/24 px above <main>'s bottom edge, and at the
  // end of the scroll <main>'s bottom padding showed as a strip under it. The
  // negative offset cancels the inset while scrolling; the matching negative
  // margin lets the bar run over that padding at the end. Both track <main>'s
  // `p-4 lg:p-6`, like the side bleed does.
  it("sits flush with the bottom edge of <main>, past its p-4 / lg:p-6 padding", () => {
    const { container } = render(
      <FormActionsBar variant="sticky" saveLabel="Зберегти" />,
    );
    const bar = container.querySelector(
      '[data-slot="form-actions-bar"]',
    ) as HTMLElement;
    expect(bar).toHaveClass(
      "sticky",
      "-bottom-4",
      "-mb-4",
      "lg:-bottom-6",
      "lg:-mb-6",
    );
    expect(bar).not.toHaveClass("bottom-0");
    // Side bleed unchanged.
    expect(bar).toHaveClass("-mx-4", "px-4", "lg:-mx-6", "lg:px-6");
  });

  it("leaves the mobile-only default bar on bottom-0 (TASK-258)", () => {
    const { container } = render(<FormActionsBar />);
    const bar = container.querySelector(
      '[data-slot="form-actions-bar"]',
    ) as HTMLElement;
    expect(bar).toHaveClass("max-md:bottom-0");
    expect(bar.className).not.toMatch(/-bottom-|-mb-/);
  });

  it("says nothing about changes while the form is clean, and can take a custom summary", () => {
    const { rerender } = render(
      <FormActionsBar
        variant="sticky"
        dirtySections={[]}
        onDiscard={() => {}}
        saveLabel="Зберегти"
      />,
    );
    expect(screen.queryByText(/Незбережені зміни/)).not.toBeInTheDocument();
    // Nothing to discard on a clean form.
    expect(
      screen.queryByRole("button", { name: dict.canon.discardChanges }),
    ).not.toBeInTheDocument();

    rerender(
      <FormActionsBar
        variant="sticky"
        summary="Є зміни в 3 розділах"
        saveLabel="Зберегти"
      />,
    );
    expect(screen.getByText("Є зміни в 3 розділах")).toBeInTheDocument();
  });

  it("disables both buttons while saving", () => {
    render(
      <FormActionsBar
        variant="sticky"
        dirtySections={["Основне"]}
        onDiscard={() => {}}
        saveLabel="Зберегти"
        isSaving
      />,
    );
    expect(
      screen.getByRole("button", { name: dict.canon.discardChanges }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeDisabled();
  });
});
