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
    expect(bar).toHaveClass("sticky", "bottom-0");
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
