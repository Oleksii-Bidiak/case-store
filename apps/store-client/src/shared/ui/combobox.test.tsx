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
});
