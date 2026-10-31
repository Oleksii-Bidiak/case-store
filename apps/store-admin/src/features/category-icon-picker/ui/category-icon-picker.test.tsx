/**
 * CategoryIconPicker (TASK-1956): a searchable icon grid in a popover from md,
 * a staged bottom sheet below it. One tab stop, arrows move and select, a pick
 * goes to the form at once (desktop) and Enter / a click closes the popover.
 */
import { useState } from "react";
import {
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { dict } from "@/shared/config";

import { CategoryIconPicker } from "./category-icon-picker";

const t = dict.categoryForm.icon;

/** A controlled host — the picker is purely presentational. */
function Host({
  initial = "",
  onChange,
  allowClear = false,
  usedKeys,
}: {
  initial?: string;
  onChange?: (key: string) => void;
  allowClear?: boolean;
  usedKeys?: ReadonlySet<string>;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CategoryIconPicker
      id="icon"
      value={value}
      onChange={(key) => {
        setValue(key);
        onChange?.(key);
      }}
      allowClear={allowClear}
      usedKeys={usedKeys}
    />
  );
}

/** The trigger is named by the form's `<Label htmlFor>`; here, by its id. */
const trigger = () => {
  const node = document.getElementById("icon");
  if (!node) throw new Error("trigger not rendered");
  return node;
};
const grid = () => screen.getByRole("radiogroup", { name: t.gridAria });

function setPhone(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe("CategoryIconPicker — popover (md+)", () => {
  beforeEach(() => setPhone(false));

  it("shows the empty state on the trigger and opens a labelled grid of the 11 icons", async () => {
    render(<Host />);
    expect(trigger()).toHaveTextContent(t.placeholder);
    expect(trigger()).toHaveAttribute("aria-haspopup", "dialog");

    await userEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    const radios = within(grid()).getAllByRole("radio");
    expect(radios).toHaveLength(11);
    expect(radios[2]).toHaveAccessibleName("Зарядка");
    expect(screen.getByText(t.keysHint)).toBeInTheDocument();
  });

  it("filters by the Ukrainian label or the English key; says when nothing matches", async () => {
    render(<Host />);
    await userEvent.click(trigger());
    const search = screen.getByRole("searchbox", { name: t.searchAria });

    await userEvent.type(search, "charger");
    expect(
      within(grid())
        .getAllByRole("radio")
        .map((r) => r.getAttribute("aria-label")),
    ).toEqual(["Зарядка"]);

    await userEvent.clear(search);
    await userEvent.type(search, "кабель");
    expect(within(grid()).getAllByRole("radio")).toHaveLength(1);

    await userEvent.clear(search);
    await userEvent.type(search, "ракета");
    expect(within(grid()).queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByText(t.noResults)).toBeInTheDocument();
  });

  it("a click writes the key, closes the popover and returns focus to the trigger", async () => {
    const onChange = jest.fn();
    render(<Host onChange={onChange} />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("radio", { name: "Кабель" }));

    expect(onChange).toHaveBeenLastCalledWith("cables");
    await waitFor(() =>
      expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument(),
    );
    expect(trigger()).toHaveTextContent("Кабель");
    await waitFor(() => expect(trigger()).toHaveFocus());
  });

  it("arrows move and select (↓ jumps a row), Enter keeps the pick and closes", async () => {
    const onChange = jest.fn();
    render(<Host initial="cases" onChange={onChange} />);
    await userEvent.click(trigger());

    const cases = screen.getByRole("radio", { name: "Чохол" });
    expect(cases).toBeChecked();
    cases.focus();

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Захисне скло" })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("glass");
    // The popover stays open while browsing with arrows.
    expect(grid()).toBeInTheDocument();

    // 8 columns: from the 2nd cell, ↓ lands on the 10th (smartphones).
    await userEvent.keyboard("{ArrowDown}");
    const phones = screen.getByRole("radio", { name: "Смартфон" });
    expect(phones).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("smartphones");

    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument(),
    );
    expect(trigger()).toHaveTextContent("Смартфон");
  });

  it("marks icons used by another root with a dot and in the accessible name", async () => {
    render(<Host usedKeys={new Set(["glass"])} />);
    await userEvent.click(trigger());

    const glass = screen.getByRole("radio", {
      name: `Захисне скло — ${t.used}`,
    });
    expect(glass.querySelector("[data-used-dot]")).toBeInTheDocument();
    expect(
      screen
        .getByRole("radio", { name: "Чохол" })
        .querySelector("[data-used-dot]"),
    ).toBeNull();
    // The legend explains the dot.
    expect(screen.getByText(t.used)).toBeInTheDocument();
  });

  it("offers «Без іконки» only where an icon is optional", async () => {
    const onChange = jest.fn();
    const { unmount } = render(<Host initial="cases" />);
    await userEvent.click(trigger());
    expect(
      screen.queryByRole("button", { name: t.none }),
    ).not.toBeInTheDocument();
    unmount();

    render(<Host initial="cases" allowClear onChange={onChange} />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("button", { name: t.none }));
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(trigger()).toHaveTextContent(t.placeholder);
  });
});

describe("CategoryIconPicker — bottom sheet (< md)", () => {
  beforeEach(() => setPhone(true));
  afterAll(() => setPhone(false));

  it("stages the pick and commits it with «Обрати «…»»", async () => {
    const onChange = jest.fn();
    render(<Host onChange={onChange} />);
    await userEvent.click(trigger());

    const sheet = screen.getByRole("dialog", { name: t.sheetTitle });
    await userEvent.click(
      within(sheet).getByRole("radio", { name: "Зарядка" }),
    );
    // Staged: nothing written yet, the sheet stays open.
    expect(onChange).not.toHaveBeenCalled();
    expect(sheet).toBeInTheDocument();

    await userEvent.click(
      within(sheet).getByRole("button", { name: t.choose("Зарядка") }),
    );
    expect(onChange).toHaveBeenCalledWith("chargers");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(trigger()).toHaveTextContent("Зарядка");
  });

  it("Escape discards the staged pick", async () => {
    const onChange = jest.fn();
    render(<Host initial="cases" onChange={onChange} />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("radio", { name: "Кабель" }));
    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger()).toHaveTextContent("Чохол");
  });
});
