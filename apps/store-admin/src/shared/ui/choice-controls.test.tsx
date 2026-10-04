import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl } from "./segmented-control";
import { SwatchPicker } from "./swatch-picker";
import { RadioCard, RadioCardGroup } from "./radio-card";

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
