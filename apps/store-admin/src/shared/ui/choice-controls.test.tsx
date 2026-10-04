import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl } from "./segmented-control";
import { SwatchPicker } from "./swatch-picker";
import { RadioCard, RadioCardGroup } from "./radio-card";
import { NumberStepper } from "./number-stepper";

function Segmented() {
  const [value, setValue] = useState("a");
  return (
    <SegmentedControl
      aria-label="Показ"
      value={value}
      onValueChange={setValue}
      options={[
        { value: "a", label: "Опубліковано" },
        { value: "b", label: "Чернетка" },
      ]}
    />
  );
}

function Swatches() {
  const [value, setValue] = useState("auto");
  return (
    <SwatchPicker
      aria-label="Оформлення"
      value={value}
      onValueChange={setValue}
      options={[
        { value: "auto", label: "Автоматично", dotClassName: "bg-primary" },
        { value: "custom", label: "Своє…" },
      ]}
    />
  );
}

describe("SegmentedControl (wave 198)", () => {
  it("is a radio group: one checked at a time", async () => {
    render(<Segmented />);

    const group = screen.getByRole("radiogroup", { name: "Показ" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Опубліковано" })).toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "Чернетка" }));
    expect(screen.getByRole("radio", { name: "Чернетка" })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Опубліковано" }),
    ).not.toBeChecked();
  });
});

describe("SwatchPicker (wave 198)", () => {
  it("names every swatch in words — colour is never the only signal", async () => {
    render(<Swatches />);

    expect(screen.getByRole("radio", { name: "Автоматично" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Своє…" }));
    expect(screen.getByRole("radio", { name: "Своє…" })).toBeChecked();
  });
});

describe("NumberStepper (wave 198)", () => {
  function Stepper({ initial }: { initial: string }) {
    const [value, setValue] = useState(initial);
    return (
      <>
        <label htmlFor="n">Скільки</label>
        <NumberStepper
          id="n"
          value={value}
          onChange={setValue}
          min={1}
          max={3}
          decreaseLabel="Менше"
          increaseLabel="Більше"
        />
      </>
    );
  }

  it("steps within min…max and keeps the middle a real spinbutton", async () => {
    render(<Stepper initial="2" />);

    const field = screen.getByRole("spinbutton", { name: "Скільки" });
    await userEvent.click(screen.getByRole("button", { name: "Більше" }));
    expect(field).toHaveValue(3);
    expect(screen.getByRole("button", { name: "Більше" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Менше" }));
    await userEvent.click(screen.getByRole("button", { name: "Менше" }));
    expect(field).toHaveValue(1);
    expect(screen.getByRole("button", { name: "Менше" })).toBeDisabled();
  });

  it("starts from the minimum when the field is empty", async () => {
    render(<Stepper initial="" />);

    await userEvent.click(screen.getByRole("button", { name: "Більше" }));
    expect(screen.getByRole("spinbutton", { name: "Скільки" })).toHaveValue(2);
  });
});

describe("RadioCard media slot (wave 198)", () => {
  it("draws the picture without adding it to the card's name", () => {
    render(
      <RadioCardGroup aria-label="Де показувати" defaultValue="x">
        <RadioCard
          value="x"
          title="Головний слайдер"
          description="Перший екран головної."
          media={<span data-testid="schema">▭</span>}
        />
      </RadioCardGroup>,
    );

    expect(screen.getByTestId("schema")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Головний слайдер" }),
    ).toHaveAccessibleDescription("Перший екран головної.");
  });
});
