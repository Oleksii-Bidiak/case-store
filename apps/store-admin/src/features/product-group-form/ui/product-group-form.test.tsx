/**
 * `ProductGroupForm` — the group form by mockup (wave 198,
 * ProductGroupsProposal ГТ3–ГТ6, TASK-1084): sections, the axis as a
 * characteristic picked from what the positions carry (free text still
 * accepted), value chips, keyboard reordering, problems, the preview and the
 * honest «Активна група» switch.
 */

import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import { ProductGroupForm } from "./product-group-form";

const f = dict.productGroupForm;
const g = dict.productGroups;

const position = (
  id: string,
  attributes: Record<string, string>,
  extra: Partial<{ price: string; isActive: boolean; stock: number }> = {},
) => ({
  id,
  slug: `p-${id}`,
  name: `Позиція ${id}`,
  price: extra.price ?? "100.00",
  attributes,
  stock: extra.stock ?? 3,
  isActive: extra.isActive ?? true,
  positionOrder: 0,
});

const POSITIONS = [
  position(
    "a",
    { "Пам'ять": "128 ГБ", Колір: "Чорний" },
    { price: "52999.00" },
  ),
  position("b", { "Пам'ять": "256 ГБ", Колір: "Білий" }, { price: "61999.00" }),
];

function renderForm(
  props: Partial<React.ComponentProps<typeof ProductGroupForm>> = {},
) {
  const onSubmit = jest.fn();
  renderWithProviders(
    <ProductGroupForm
      onSubmit={onSubmit}
      isPending={false}
      cancelHref="/product-groups"
      {...props}
    />,
  );
  return { onSubmit };
}

const axisInput = (i: number) =>
  screen.getByRole("combobox", { name: f.axisNameAria(i) });

describe("ProductGroupForm (wave 198)", () => {
  it("requires the name: one summary, the error under the field", async () => {
    const { onSubmit } = renderForm();

    const name = screen.getByRole("textbox", { name: f.name });
    expect(name).toHaveAttribute("aria-required", "true");
    expect(name).toHaveAttribute("placeholder", f.namePlaceholder);
    expect(screen.getByText(f.nameHint)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: f.submit }));

    expect(await screen.findByText(f.formAlert)).toBeInTheDocument();
    expect(screen.getByText(f.errors.nameRequired)).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("offers the characteristics the positions carry, with how many carry each", async () => {
    renderForm({
      id: "g1",
      defaultValues: { name: "iPhone 16 Pro", axes: [], isActive: true },
      positions: POSITIONS,
    });

    await userEvent.click(screen.getByRole("button", { name: f.addAxis }));
    await userEvent.type(axisInput(1), "Ко");

    const option = await screen.findByRole("option", { name: /Колір/ });
    expect(option).toHaveTextContent(f.axisUsage(2));
    await userEvent.click(option);

    expect(axisInput(1)).toHaveValue("Колір");
    // The values the positions hold become chips next to the axis.
    expect(screen.getAllByText("Чорний").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Білий").length).toBeGreaterThan(0);
  });

  it("still accepts a characteristic typed by hand (no positions yet)", async () => {
    const { onSubmit } = renderForm();

    expect(screen.getByText(f.axesNoPositions)).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole("textbox", { name: f.name }),
      "Кабель Hoco",
    );
    await userEvent.click(screen.getByRole("button", { name: f.addAxis }));
    await userEvent.type(axisInput(1), "Довжина");
    await userEvent.click(screen.getByRole("button", { name: f.submit }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        name: "Кабель Hoco",
        axes: [{ name: "Довжина" }],
      }),
    );
  });

  it("reorders the axes from the keyboard — the order is the order on the site", async () => {
    const { onSubmit } = renderForm({
      id: "g1",
      defaultValues: {
        name: "iPhone 16 Pro",
        axes: [{ name: "Пам'ять" }, { name: "Колір" }],
        isActive: true,
      },
      positions: POSITIONS,
    });

    expect(screen.getByText(f.axesOrder)).toBeInTheDocument();
    const grip = screen.getByRole("button", {
      name: f.moveAxisAria("Пам'ять"),
    });
    fireEvent.keyDown(grip, { key: "ArrowDown" });

    await waitFor(() => expect(axisInput(1)).toHaveValue("Колір"));
    expect(axisInput(2)).toHaveValue("Пам'ять");

    await userEvent.click(screen.getByRole("button", { name: f.submit }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].axes).toEqual([
      { name: "Колір" },
      { name: "Пам'ять" },
    ]);
  });

  it("removes an axis", async () => {
    renderForm({
      id: "g1",
      defaultValues: {
        name: "iPhone 16 Pro",
        axes: [{ name: "Пам'ять" }, { name: "Колір" }],
        isActive: true,
      },
      positions: POSITIONS,
    });

    await userEvent.click(
      screen.getByRole("button", { name: f.removeAxisAria(1) }),
    );

    expect(axisInput(1)).toHaveValue("Колір");
    expect(
      screen.queryByRole("combobox", { name: f.axisNameAria(2) }),
    ).not.toBeInTheDocument();
  });

  it("flags problems in the positions — a missing value and a repeated pair", () => {
    renderForm({
      id: "g1",
      defaultValues: {
        name: "iPhone 16 Pro",
        axes: [{ name: "Пам'ять" }, { name: "Колір" }],
        isActive: true,
      },
      positions: [
        position("a", { "Пам'ять": "128 ГБ" }),
        position("b", { "Пам'ять": "256 ГБ", Колір: "Чорний" }),
        position("c", { "Пам'ять": "256 ГБ", Колір: "Чорний" }),
      ],
    });

    expect(screen.getByText(g.problemsLead(2))).toBeInTheDocument();
  });

  it("previews the choice as the site shows it and sums the positions up", () => {
    renderForm({
      id: "g1",
      defaultValues: {
        name: "iPhone 16 Pro",
        axes: [{ name: "Пам'ять" }],
        isActive: true,
      },
      positions: [
        ...POSITIONS,
        position(
          "c",
          { "Пам'ять": "512 ГБ" },
          { isActive: false, price: "79999.00" },
        ),
      ],
    });

    const preview = screen.getByRole("region", { name: g.preview });
    expect(within(preview).getByText("Пам'ять")).toBeInTheDocument();
    expect(within(preview).getByText("512 ГБ")).toBeInTheDocument();
    expect(screen.getByText(g.summaryShownValue(2, 3))).toBeInTheDocument();
    // uk-UA groups with a non-breaking space; compare as a reader would.
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === "DD" &&
          el.textContent?.replace(/\s/g, " ") === "52 999 – 79 999 ₴",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the active flag as a switch with honest copy", async () => {
    const { onSubmit } = renderForm({
      id: "g1",
      defaultValues: { name: "iPhone 16 Pro", axes: [], isActive: true },
    });

    expect(screen.getByText(f.activeHint)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: f.active }));
    await userEvent.click(screen.getByRole("button", { name: f.submit }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].isActive).toBe(false);
  });

  it("read-only: nothing to change, nothing to save", () => {
    renderForm({
      id: "g1",
      readOnly: true,
      defaultValues: {
        name: "iPhone 16 Pro",
        axes: [{ name: "Пам'ять" }],
        isActive: true,
      },
      positions: POSITIONS,
    });

    expect(screen.getByRole("textbox", { name: f.name })).toBeDisabled();
    expect(axisInput(1)).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: f.addAxis }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: f.submit }),
    ).not.toBeInTheDocument();
  });
});
