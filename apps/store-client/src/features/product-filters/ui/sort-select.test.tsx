import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { SortSelect } from "./sort-select";

describe("SortSelect", () => {
  it("names the control and shows the current sort's label", () => {
    renderWithProviders(
      <SortSelect currentSort="price:asc" onChange={jest.fn()} />,
    );

    const trigger = screen.getByRole("combobox", {
      name: dict.filters.sortBy,
    });
    // «Спочатку: дешевші» — the prefix, then the lowercase value (Д3-2 §5).
    expect(trigger).toHaveTextContent(
      `${dict.filters.sortPrefix}${dict.filters.sortValue.priceAsc}`,
    );
  });

  it("never repeats «Спочатку» on the trigger", () => {
    renderWithProviders(
      <SortSelect currentSort="createdAt:desc" onChange={jest.fn()} />,
    );
    const trigger = screen.getByRole("combobox", {
      name: dict.filters.sortBy,
    });
    expect(trigger.textContent?.match(/Спочатку/g)).toHaveLength(1);
  });

  it("shows an option without a short value alone, with no prefix", () => {
    renderWithProviders(
      <SortSelect
        currentSort="relevance"
        options={[{ value: "relevance", label: "За релевантністю" }]}
        onChange={jest.fn()}
      />,
    );
    const trigger = screen.getByRole("combobox", {
      name: dict.filters.sortBy,
    });
    expect(trigger).toHaveTextContent("За релевантністю");
    expect(trigger).not.toHaveTextContent(dict.filters.sortPrefix);
  });

  // TASK-1301 fix round: at 320px the longest labels pushed the catalogue and
  // /promo toolbars past the viewport. The label now sits in a truncating block
  // inside a trigger that is allowed to shrink.
  it("lets the trigger shrink and truncates the label instead of overflowing", () => {
    renderWithProviders(
      <SortSelect currentSort="price:desc" onChange={jest.fn()} />,
    );

    const trigger = screen.getByRole("combobox", {
      name: dict.filters.sortBy,
    });
    expect(trigger).toHaveClass("min-w-0");
    expect(screen.getByText(dict.filters.sortValue.priceDesc)).toHaveClass(
      "truncate",
    );
  });

  it("applies both sort fields when an option is picked", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <SortSelect currentSort="createdAt:desc" onChange={onChange} />,
    );

    await user.click(
      screen.getByRole("combobox", { name: dict.filters.sortBy }),
    );
    await user.click(
      screen.getByRole("option", { name: dict.filters.sort.popular }),
    );

    expect(onChange).toHaveBeenCalledWith({
      sortBy: "bestselling",
      sortOrder: "desc",
    });
  });

  // TASK-876: /search reuses this pill with its own vocabulary — one `sort`
  // param instead of the column pair.
  it("hands the picked value through a caller's own mapping", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <SortSelect
        currentSort="relevance"
        options={[
          { value: "relevance", label: "За релевантністю" },
          { value: "price_asc", label: dict.filters.sort.priceAsc },
        ]}
        ariaLabel="Сортування результатів"
        toUpdates={(value) => ({ sort: value })}
        onChange={onChange}
      />,
    );

    await user.click(
      screen.getByRole("combobox", { name: "Сортування результатів" }),
    );
    await user.click(
      screen.getByRole("option", { name: dict.filters.sort.priceAsc }),
    );

    expect(onChange).toHaveBeenCalledWith({ sort: "price_asc" });
  });
});
