import { render, screen } from "@/shared/test/render";
import userEvent from "@testing-library/user-event";
import { Combobox, type ComboboxOption } from "./combobox";

const options: ComboboxOption[] = [
  { value: "city-1", label: "м. Київ, Київська обл." },
  { value: "city-2", label: "м. Львів, Львівська обл." },
];

function setup(props: Partial<React.ComponentProps<typeof Combobox>> = {}) {
  const onInputChange = jest.fn();
  const onSelect = jest.fn();
  render(
    <Combobox
      id="cb"
      value=""
      onInputChange={onInputChange}
      onSelect={onSelect}
      options={options}
      loadingText="Пошук…"
      emptyText="Нічого не знайдено"
      {...props}
    />,
  );
  return { onInputChange, onSelect };
}

describe("Combobox", () => {
  it("renders an input with the combobox role", () => {
    setup();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("calls onInputChange with the raw text on each keystroke", async () => {
    const user = userEvent.setup();
    const { onInputChange } = setup();

    await user.type(screen.getByRole("combobox"), "К");

    expect(onInputChange).toHaveBeenCalledWith("К");
  });

  it("opens the listbox and shows options on focus", async () => {
    const user = userEvent.setup();
    setup({ value: "Ки" });

    await user.click(screen.getByRole("combobox"));

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("м. Київ, Київська обл.")).toBeInTheDocument();
  });

  it("calls onSelect with the chosen option when clicked", async () => {
    const user = userEvent.setup();
    const { onSelect } = setup({ value: "Ки" });

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("м. Львів, Львівська обл."));

    expect(onSelect).toHaveBeenCalledWith(options[1]);
  });

  it("selects the active option with ArrowDown + Enter", async () => {
    const user = userEvent.setup();
    const { onSelect } = setup({ value: "Ки" });

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onSelect).toHaveBeenCalledWith(options[0]);
  });

  it("shows the loading text while fetching", async () => {
    const user = userEvent.setup();
    setup({ value: "Ки", options: [], isLoading: true });

    await user.click(screen.getByRole("combobox"));

    expect(screen.getByText("Пошук…")).toBeInTheDocument();
  });

  it("shows the empty text when there are no options for a non-empty query", async () => {
    const user = userEvent.setup();
    setup({ value: "zzz", options: [] });

    await user.click(screen.getByRole("combobox"));

    expect(screen.getByText("Нічого не знайдено")).toBeInTheDocument();
  });

  it("does not open when disabled", async () => {
    const user = userEvent.setup();
    setup({ value: "Ки", disabled: true });

    await user.click(screen.getByRole("combobox"));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  // APG combobox pattern (TASK-275): the input must always name the highlighted
  // option via `aria-activedescendant`, and the attribute must be absent — not
  // an empty string — whenever nothing is highlighted.
  describe("aria-activedescendant contract", () => {
    it("has no aria-activedescendant while closed or with nothing highlighted", async () => {
      const user = userEvent.setup();
      setup({ value: "Ки" });

      const input = screen.getByRole("combobox");
      expect(input).not.toHaveAttribute("aria-activedescendant");

      // Open, but no option highlighted yet.
      await user.click(input);
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      expect(input).not.toHaveAttribute("aria-activedescendant");
    });

    it("names the highlighted option's id on ArrowDown/ArrowUp and keeps focus on the input", async () => {
      const user = userEvent.setup();
      setup({ value: "Ки" });

      const input = screen.getByRole("combobox");
      await user.click(input);
      const [first, second] = screen.getAllByRole("option");

      await user.keyboard("{ArrowDown}");
      expect(input).toHaveAttribute("aria-activedescendant", first.id);
      expect(first).toHaveAttribute("aria-selected", "true");
      expect(input).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      expect(input).toHaveAttribute("aria-activedescendant", second.id);
      expect(second).toHaveAttribute("aria-selected", "true");

      await user.keyboard("{ArrowUp}");
      expect(input).toHaveAttribute("aria-activedescendant", first.id);
      expect(input).toHaveFocus();
    });

    // APG combobox (TASK-508): with nothing highlighted, ↓ enters the list at
    // the top and ↑ at the bottom. It used to clamp to the first row both ways.
    it("moves ArrowUp from the input to the LAST option, ArrowDown to the first", async () => {
      const user = userEvent.setup();
      setup({ value: "Ки" });

      const input = screen.getByRole("combobox");
      await user.click(input);
      const [first, second] = screen.getAllByRole("option");

      await user.keyboard("{ArrowUp}");
      expect(input).toHaveAttribute("aria-activedescendant", second.id);
      expect(second).toHaveAttribute("aria-selected", "true");

      // Up again walks towards the top and stops there.
      await user.keyboard("{ArrowUp}{ArrowUp}");
      expect(input).toHaveAttribute("aria-activedescendant", first.id);

      // A fresh keystroke resets the selection; ↓ then starts at the top.
      await user.type(input, "ї");
      expect(input).not.toHaveAttribute("aria-activedescendant");
      await user.keyboard("{ArrowDown}");
      expect(input).toHaveAttribute("aria-activedescendant", first.id);
    });

    it("opens a closed list on ArrowUp without selecting anything", async () => {
      const user = userEvent.setup();
      setup({ value: "Ки" });

      const input = screen.getByRole("combobox");
      await user.click(input);
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

      await user.keyboard("{ArrowUp}");
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      expect(input).not.toHaveAttribute("aria-activedescendant");
    });

    it("drops aria-activedescendant when the list is closed with Escape", async () => {
      const user = userEvent.setup();
      setup({ value: "Ки" });

      const input = screen.getByRole("combobox");
      await user.click(input);
      await user.keyboard("{ArrowDown}");
      expect(input).toHaveAttribute("aria-activedescendant");

      await user.keyboard("{Escape}");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(input).not.toHaveAttribute("aria-activedescendant");
    });

    it("gives options ids even when no id prop is passed", async () => {
      const user = userEvent.setup();
      setup({ value: "Ки", id: undefined });

      const input = screen.getByRole("combobox");
      await user.click(input);
      await user.keyboard("{ArrowDown}");

      const [first] = screen.getAllByRole("option");
      expect(first.id).not.toBe("");
      expect(input).toHaveAttribute("aria-activedescendant", first.id);
    });
  });

  // APG list-autocomplete example: Home/End are the textbox's caret keys. With
  // an option highlighted they return visual focus to the input, so a
  // following Enter commits the typed text instead of the highlighted row.
  describe("Home / End", () => {
    it.each(["{Home}", "{End}"])(
      "%s drops the highlight and leaves Enter to the free text",
      async (key) => {
        const user = userEvent.setup();
        const { onSelect } = setup({ value: "Ки" });

        const input = screen.getByRole("combobox");
        await user.click(input);
        await user.keyboard("{ArrowDown}");
        expect(input).toHaveAttribute("aria-activedescendant");

        await user.keyboard(key);
        expect(input).not.toHaveAttribute("aria-activedescendant");
        expect(screen.getByRole("listbox")).toBeInTheDocument();
        expect(input).toHaveFocus();

        await user.keyboard("{Enter}");
        expect(onSelect).not.toHaveBeenCalled();
      },
    );
  });

  // TASK-502: the list is a Radix Popover portalled to <body> (no `overflow`
  // ancestor can clip it, collisions flip it), while DOM focus stays on the
  // input for the whole interaction.
  describe("popover placement", () => {
    it("portals the listbox out of the field's own DOM subtree", async () => {
      const user = userEvent.setup();
      setup({ value: "Ки" });

      const input = screen.getByRole("combobox");
      await user.click(input);
      const listbox = screen.getByRole("listbox");

      expect(input.parentElement).not.toContainElement(listbox);
      expect(listbox).toHaveAttribute("id", "cb-listbox");
      expect(input).toHaveAttribute("aria-controls", "cb-listbox");
      expect(input).toHaveAttribute("aria-expanded", "true");
    });

    it("points aria-controls at the listbox only while it is in the DOM", () => {
      setup({ value: "Ки" });

      const input = screen.getByRole("combobox");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(input).not.toHaveAttribute("aria-controls");
    });

    it("keeps focus on the input when the list opens", async () => {
      const user = userEvent.setup();
      setup({ value: "Ки" });

      const input = screen.getByRole("combobox");
      await user.click(input);

      expect(screen.getByRole("listbox")).toBeInTheDocument();
      expect(input).toHaveFocus();
    });

    it("stays open when the already-focused input is clicked again", async () => {
      const user = userEvent.setup();
      setup({ value: "Ки" });

      const input = screen.getByRole("combobox");
      await user.click(input);
      await user.click(input);

      expect(screen.getByRole("listbox")).toBeInTheDocument();
      expect(input).toHaveAttribute("aria-expanded", "true");
    });

    it("does not blur the input on a press inside the popup", async () => {
      const user = userEvent.setup();
      setup({ value: "Ки" });

      const input = screen.getByRole("combobox");
      await user.click(input);
      await user.pointer({
        keys: "[MouseLeft>]",
        target: screen.getByRole("listbox"),
      });

      expect(input).toHaveFocus();
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      await user.pointer({ keys: "[/MouseLeft]" });
    });

    it("closes when the pointer goes down outside the field and the popup", async () => {
      const user = userEvent.setup();
      setup({ value: "Ки" });

      await user.click(screen.getByRole("combobox"));
      await user.click(document.body);

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(screen.getByRole("combobox")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });

    it("scrolls the keyboard-highlighted option into view", async () => {
      const user = userEvent.setup();
      setup({ value: "Ки" });
      const spy = jest.spyOn(Element.prototype, "scrollIntoView");

      await user.click(screen.getByRole("combobox"));
      await user.keyboard("{ArrowUp}");

      const [, second] = screen.getAllByRole("option");
      expect(spy.mock.contexts).toContain(second);
      expect(spy).toHaveBeenLastCalledWith({ block: "nearest" });
      spy.mockRestore();
    });
  });

  // TASK-411: `activeIndex` is the KEYBOARD selection and nothing else. It
  // used to be written by onMouseEnter too, so a cursor left resting over the
  // popup silently re-targeted Enter at whatever row it happened to cover.
  describe("hover is separate from the keyboard selection", () => {
    it("does not highlight an option the pointer merely crosses", async () => {
      const user = userEvent.setup();
      const { onSelect } = setup({ value: "Ки" });

      const input = screen.getByRole("combobox");
      await user.click(input);
      const [first, second] = screen.getAllByRole("option");

      await user.hover(second);
      expect(second).toHaveAttribute("aria-selected", "false");
      expect(first).toHaveAttribute("aria-selected", "false");
      expect(input).not.toHaveAttribute("aria-activedescendant");

      // Enter over a hovered row selects nothing — the typed free text is left
      // for the form to submit (the Nova Poshta fallback depends on this).
      await user.keyboard("{Enter}");
      expect(onSelect).not.toHaveBeenCalled();

      // And the first ArrowDown still starts at the top of the list.
      await user.keyboard("{ArrowDown}");
      expect(first).toHaveAttribute("aria-selected", "true");
      expect(input).toHaveAttribute("aria-activedescendant", first.id);
    });

    it("still selects the row that is clicked", async () => {
      const user = userEvent.setup();
      const { onSelect } = setup({ value: "Ки" });

      const input = screen.getByRole("combobox");
      await user.click(input);
      const [, second] = screen.getAllByRole("option");

      await user.hover(second);
      await user.click(second);

      expect(onSelect).toHaveBeenCalledWith(options[1]);
    });
  });
});
