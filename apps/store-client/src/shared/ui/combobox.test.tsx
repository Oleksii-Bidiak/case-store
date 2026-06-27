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
});
