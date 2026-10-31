import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, within } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { PickerModel } from "../model/series";
import { DeviceSeriesPicker } from "./device-series-picker";

const t = dict.seriesPicker;

const BRANDS = [{ id: "b-1", name: "Apple" }];
const MODELS: PickerModel[] = [
  {
    id: "15pm",
    name: "iPhone 15 Pro Max",
    series: "iPhone 15",
    releaseYear: 2023,
    deviceBrandId: "b-1",
    productCount: 38,
  },
  {
    id: "15p",
    name: "iPhone 15 Pro",
    series: "iPhone 15",
    releaseYear: 2023,
    deviceBrandId: "b-1",
    productCount: 44,
  },
  {
    id: "15pl",
    name: "iPhone 15 Plus",
    series: "iPhone 15",
    releaseYear: 2023,
    deviceBrandId: "b-1",
    productCount: 23,
  },
  {
    id: "15",
    name: "iPhone 15",
    series: "iPhone 15",
    releaseYear: 2023,
    deviceBrandId: "b-1",
    productCount: 51,
  },
  {
    id: "14",
    name: "iPhone 14",
    series: "iPhone 14",
    releaseYear: 2022,
    deviceBrandId: "b-1",
    productCount: 9,
  },
];

function Harness({ initial = [] as string[] }) {
  const [value, setValue] = useState(() => new Set(initial));
  return (
    <>
      <DeviceSeriesPicker
        models={MODELS}
        brands={BRANDS}
        value={value}
        onChange={setValue}
        idPrefix="t"
        showCounts
      />
      <output data-testid="value">{[...value].sort().join(",")}</output>
    </>
  );
}

const value = () => screen.getByTestId("value").textContent;

describe("DeviceSeriesPicker (TASK-1955)", () => {
  it("draws the series checkbox as none → some (dash) → all", async () => {
    renderWithProviders(<Harness />);
    const series = screen.getByRole("checkbox", {
      name: t.seriesAria("iPhone 15"),
    });
    expect(series).toHaveAttribute("data-state", "unchecked");
    expect(screen.getByText(t.stateNone(4))).toBeInTheDocument();

    // Open the closed series, tick one chip: the series shows a dash.
    await userEvent.click(screen.getByRole("button", { name: /iPhone 15/ }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: "iPhone 15 Pro" }),
    );
    expect(series).toHaveAttribute("data-state", "indeterminate");
    expect(screen.getByText(t.stateSome(1, 4))).toBeInTheDocument();

    // Some → the click ticks the rest of the series.
    await userEvent.click(series);
    expect(series).toHaveAttribute("data-state", "checked");
    expect(value()).toBe("15,15p,15pl,15pm");
    expect(
      screen.getByText(t.summaryWhole("iPhone 15", 4)),
    ).toBeInTheDocument();

    // All → the click clears it.
    await userEvent.click(series);
    expect(value()).toBe("");
  });

  it("opens the series with a tick, shows short chip names and counts", () => {
    renderWithProviders(<Harness initial={["15p"]} />);
    const chip = screen.getByRole("checkbox", { name: "iPhone 15 Pro" });
    const label = chip.closest("label") as HTMLElement;
    expect(within(label).getByText("15 Pro")).toBeInTheDocument();
    expect(within(label).getByText("44")).toBeInTheDocument();
    // iPhone 14 has no tick: closed.
    expect(screen.queryByRole("checkbox", { name: "iPhone 14" })).toBeNull();
    expect(screen.getByText(t.summaryLead(1))).toBeInTheDocument();
  });

  it("reminds about the one missing model, and «Очистити» empties the selection", async () => {
    renderWithProviders(<Harness initial={["15", "15p", "15pl"]} />);
    expect(
      screen.getByText(t.reminderTitle("iPhone 15 Pro Max")),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: t.clear }));
    expect(value()).toBe("");
    expect(screen.queryByText(t.reminderTitle("iPhone 15 Pro Max"))).toBeNull();
  });

  it("searches across series and says when nothing matches", async () => {
    renderWithProviders(<Harness />);
    await userEvent.type(
      screen.getByRole("searchbox", { name: t.searchAria }),
      "plus",
    );
    expect(
      screen.getByRole("checkbox", { name: "iPhone 15 Plus" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "iPhone 15 Pro" }),
    ).toBeNull();

    await userEvent.clear(
      screen.getByRole("searchbox", { name: t.searchAria }),
    );
    await userEvent.type(
      screen.getByRole("searchbox", { name: t.searchAria }),
      "nokia",
    );
    expect(screen.getByText(t.nothingFound)).toBeInTheDocument();
  });
});
