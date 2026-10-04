/**
 * `AddonServiceForm` — the add-on service form as the dialog body (wave 198,
 * AddonServicesProposal ДП4–ДП7, TASK-1083): required marks, the description
 * counter, «₴» inside the price field, the error REPLACING the price hint, the
 * «Показувати в кошику» Switch and the read-only variant.
 */

import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import { AddonServiceForm } from "./addon-service-form";

const f = dict.addonServiceForm;

function renderForm(
  props: Partial<React.ComponentProps<typeof AddonServiceForm>> = {},
) {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();
  renderWithProviders(
    <AddonServiceForm
      onSubmit={onSubmit}
      onCancel={onCancel}
      isPending={false}
      {...props}
    />,
  );
  return { onSubmit, onCancel };
}

describe("AddonServiceForm (wave 198)", () => {
  it("marks name and price as required and offers the Ukrainian placeholder", () => {
    renderForm();

    const name = screen.getByRole("textbox", { name: f.name });
    expect(name).toHaveAttribute("aria-required", "true");
    expect(name).toHaveAttribute("placeholder", f.namePlaceholder);
    expect(screen.getByRole("textbox", { name: f.price })).toHaveAttribute(
      "aria-required",
      "true",
    );
    // The description is optional — no star, no aria-required.
    expect(
      screen.getByRole("textbox", { name: f.description }),
    ).not.toHaveAttribute("aria-required");
  });

  it("counts the description against 300", async () => {
    renderForm();

    expect(screen.getByText(f.counter(0, 300))).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole("textbox", { name: f.description }),
      "Гарантія",
    );
    expect(screen.getByText(f.counter(8, 300))).toBeInTheDocument();
    expect(screen.getByText(f.descriptionHint)).toBeInTheDocument();
  });

  it("draws «₴» inside the price field and the hint under it", () => {
    renderForm();

    expect(screen.getByText(f.currency)).toBeInTheDocument();
    expect(screen.getByText(f.priceHint)).toBeInTheDocument();
  });

  it("on an empty submit: one summary, errors under the fields, the price hint replaced", async () => {
    const { onSubmit } = renderForm();

    await userEvent.click(screen.getByRole("button", { name: f.submit }));

    expect(await screen.findByText(f.formAlert(2))).toBeInTheDocument();
    expect(screen.getByText(f.errors.nameRequired)).toBeInTheDocument();
    expect(screen.getByText(f.errors.priceRequired)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: f.name })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("textbox", { name: f.price })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    // The error stands where the hint stood — not under it.
    expect(screen.queryByText(f.priceHint)).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the values with «Показувати в кошику» as a switch", async () => {
    const { onSubmit } = renderForm({ submitLabel: "Створити послугу" });

    await userEvent.type(
      screen.getByRole("textbox", { name: f.name }),
      "Наклеювання скла",
    );
    await userEvent.type(screen.getByRole("textbox", { name: f.price }), "199");
    const toggle = screen.getByRole("switch", { name: f.active });
    expect(toggle).toBeChecked();
    expect(screen.getByText(f.activeHint)).toBeInTheDocument();
    await userEvent.click(toggle);

    await userEvent.click(
      screen.getByRole("button", { name: "Створити послугу" }),
    );

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        name: "Наклеювання скла",
        price: "199",
        isActive: false,
      }),
    );
  });

  it("«Скасувати» closes without saving", async () => {
    const { onCancel, onSubmit } = renderForm();

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.cancel }),
    );

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("read-only: the fields are disabled and there is nothing to save", () => {
    renderForm({
      readOnly: true,
      id: "s1",
      defaultValues: { name: "Гарантія", price: "499", isActive: true },
    });

    expect(screen.getByText(dict.common.viewOnly)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: f.name })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: f.submit }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.common.close }),
    ).toBeInTheDocument();
  });
});
