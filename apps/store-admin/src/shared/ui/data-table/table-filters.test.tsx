/**
 * `TableFilters` — assertions are on the URL the control REPLACED.
 *
 * A filter that renders the right label while writing the wrong param, or while
 * leaving `?page=7` in place, looks correct on screen and shows the operator
 * rows from a page the narrowed result set does not have. That is the failure
 * this file exists to catch; the chip tests cover the other half — a filter you
 * cannot see is a filter you cannot undo.
 */

import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { TableFilters, type TableFilterDef } from "./table-filters";

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/products",
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams("");
});

const STATUS: TableFilterDef = {
  param: "status",
  label: "Статус",
  allLabel: "Усі статуси",
  options: [
    { value: "active", label: "Активні" },
    { value: "hidden", label: "Приховані" },
  ],
};

const STOCK: TableFilterDef = {
  param: "stock",
  label: "Наявність",
  allLabel: "Будь-яка",
  options: [{ value: "out", label: "Немає в наявності" }],
};

describe("TableFilters", () => {
  it("writes the chosen option to its own param and resets the page", async () => {
    mockSearchParams = new URLSearchParams("page=5&search=usb");
    const user = userEvent.setup();
    renderWithProviders(<TableFilters filters={[STATUS]} values={{}} />);

    await user.click(screen.getByRole("combobox", { name: "Статус" }));
    await user.click(screen.getByRole("option", { name: "Приховані" }));

    // `page` dropped, `search` kept: narrowing one control must never discard
    // what the operator typed into another.
    expect(mockReplace).toHaveBeenCalledWith(
      "/products?search=usb&status=hidden",
    );
  });

  it("deletes the param when the operator picks the all-option", async () => {
    mockSearchParams = new URLSearchParams("status=hidden&page=3");
    const user = userEvent.setup();
    renderWithProviders(
      <TableFilters filters={[STATUS]} values={{ status: "hidden" }} />,
    );

    await user.click(screen.getByRole("combobox", { name: "Статус" }));
    await user.click(screen.getByRole("option", { name: "Усі статуси" }));

    // Absent, not `status=`: an empty param would be a value the DTO has to
    // reject, and `useUrlParams` treats "" as a delete for exactly that reason.
    expect(mockReplace).toHaveBeenCalledWith("/products");
  });

  it("shows the current value as the trigger's text, from the URL alone", () => {
    renderWithProviders(
      <TableFilters filters={[STATUS]} values={{ status: "hidden" }} />,
    );

    expect(screen.getByRole("combobox", { name: "Статус" })).toHaveTextContent(
      "Приховані",
    );
  });

  it("renders no chip while nothing is filtered", () => {
    renderWithProviders(<TableFilters filters={[STATUS, STOCK]} values={{}} />);

    expect(
      screen.queryByRole("button", { name: /Прибрати фільтр/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(dict.common.table.clearAllFilters),
    ).not.toBeInTheDocument();
  });

  it("shows a chip per active filter, clearing just that one", async () => {
    mockSearchParams = new URLSearchParams("status=hidden&stock=out");
    const user = userEvent.setup();
    renderWithProviders(
      <TableFilters
        filters={[STATUS, STOCK]}
        values={{ status: "hidden", stock: "out" }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: dict.common.table.clearFilterAria("Статус", "Приховані"),
      }),
    );

    // Only `status` gone — the other chip's filter survives.
    expect(mockReplace).toHaveBeenCalledWith("/products?stock=out");
  });

  it("offers clear-all only once more than one filter is on, and drops them together", async () => {
    mockSearchParams = new URLSearchParams(
      "status=hidden&stock=out&search=usb",
    );
    const user = userEvent.setup();
    renderWithProviders(
      <TableFilters
        filters={[STATUS, STOCK]}
        values={{ status: "hidden", stock: "out" }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: dict.common.table.clearAllFilters }),
    );

    // Every filter param dropped; the SEARCH TERM is not a filter and stays —
    // clearing the filters must not silently throw away the query too.
    expect(mockReplace).toHaveBeenCalledWith("/products?search=usb");
  });

  it("hides clear-all with a single active filter — the chip already is it", () => {
    renderWithProviders(
      <TableFilters filters={[STATUS, STOCK]} values={{ status: "hidden" }} />,
    );

    expect(
      screen.getByRole("button", {
        name: dict.common.table.clearFilterAria("Статус", "Приховані"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: dict.common.table.clearAllFilters,
      }),
    ).not.toBeInTheDocument();
  });

  it("still offers a chip for a value it does not recognise", () => {
    // A hand-edited link, or an option renamed since the link was shared. The
    // rows ARE narrowed by it, so the escape hatch has to exist.
    renderWithProviders(
      <TableFilters filters={[STATUS]} values={{ status: "legacy" }} />,
    );

    expect(
      screen.getByRole("button", {
        name: dict.common.table.clearFilterAria("Статус", "legacy"),
      }),
    ).toBeInTheDocument();
  });

  it("disables every control while a bulk write is in flight", () => {
    renderWithProviders(
      <TableFilters
        filters={[STATUS]}
        values={{ status: "hidden" }}
        disabled
      />,
    );

    expect(screen.getByRole("combobox", { name: "Статус" })).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: dict.common.table.clearFilterAria("Статус", "Приховані"),
      }),
    ).toBeDisabled();
  });
});
