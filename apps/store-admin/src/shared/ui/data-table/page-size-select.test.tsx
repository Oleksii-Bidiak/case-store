/**
 * `PageSizeSelect` / `pageSizeFrom` / `TablePagination` (TASK-423).
 *
 * `pageSizeFrom` is the guard that matters: the value it returns is forwarded
 * verbatim as `?limit=` to a DTO that allow-lists it with `@Max(100)`, so a
 * hand-edited `?limit=5000` must come back as 20 here rather than as a 400 the
 * operator reads as a broken screen.
 */

import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  PageSizeSelect,
  pageSizeFrom,
} from "./page-size-select";
import { TablePagination } from "./table-pagination";

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

describe("pageSizeFrom", () => {
  it("defaults to 20 when the URL says nothing", () => {
    expect(pageSizeFrom(new URLSearchParams(""))).toBe(DEFAULT_PAGE_SIZE);
  });

  it("accepts exactly the offered sizes", () => {
    for (const size of PAGE_SIZE_OPTIONS) {
      expect(pageSizeFrom(new URLSearchParams(`limit=${size}`))).toBe(size);
    }
  });

  it.each(["5000", "0", "-20", "25", "abc", ""])(
    "clamps an unoffered ?limit=%s back to the default",
    (raw) => {
      expect(pageSizeFrom(new URLSearchParams(`limit=${raw}`))).toBe(
        DEFAULT_PAGE_SIZE,
      );
    },
  );

  it("offers nothing above the API's @Max(100) cap", () => {
    expect(Math.max(...PAGE_SIZE_OPTIONS)).toBeLessThanOrEqual(100);
  });
});

describe("PageSizeSelect", () => {
  it("writes the chosen size to ?limit= and resets the page", async () => {
    mockSearchParams = new URLSearchParams("page=7&search=usb");
    const user = userEvent.setup();
    renderWithProviders(<PageSizeSelect value={20} />);

    await user.click(
      screen.getByRole("combobox", { name: dict.common.table.pageSizeLabel }),
    );
    await user.click(screen.getByRole("option", { name: "100" }));

    // Page 7 of 20-row pages is not page 7 of 100-row pages, and usually does
    // not exist at all — so the page is dropped while the search is kept.
    expect(mockReplace).toHaveBeenCalledWith("/products?search=usb&limit=100");
  });

  it("removes ?limit= when the operator goes back to the default", async () => {
    mockSearchParams = new URLSearchParams("limit=100");
    const user = userEvent.setup();
    renderWithProviders(<PageSizeSelect value={100} />);

    await user.click(
      screen.getByRole("combobox", { name: dict.common.table.pageSizeLabel }),
    );
    await user.click(screen.getByRole("option", { name: "20" }));

    // The default is the URL-absent shape, so the plain view of a list has ONE
    // URL rather than two that TanStack Query would cache separately.
    expect(mockReplace).toHaveBeenCalledWith("/products");
  });

  it("shows the size currently in force", () => {
    renderWithProviders(<PageSizeSelect value={50} />);
    expect(
      screen.getByRole("combobox", { name: dict.common.table.pageSizeLabel }),
    ).toHaveTextContent("50");
  });
});

describe("TablePagination", () => {
  it("drops ?page= entirely when stepping back to the first page", async () => {
    mockSearchParams = new URLSearchParams("page=2");
    const user = userEvent.setup();
    renderWithProviders(
      <TablePagination page={2} totalPages={5} pageSize={20} />,
    );

    await user.click(
      screen.getByRole("button", { name: dict.common.previous }),
    );

    expect(mockReplace).toHaveBeenCalledWith("/products");
  });

  it("advances the page without disturbing the rest of the view", async () => {
    mockSearchParams = new URLSearchParams("search=usb&status=hidden");
    const user = userEvent.setup();
    renderWithProviders(
      <TablePagination page={1} totalPages={5} pageSize={20} />,
    );

    await user.click(screen.getByRole("button", { name: dict.common.next }));

    expect(mockReplace).toHaveBeenCalledWith(
      "/products?search=usb&status=hidden&page=2",
    );
  });

  it("disables the ends of the range", () => {
    renderWithProviders(
      <TablePagination page={1} totalPages={1} pageSize={20} />,
    );

    expect(
      screen.getByRole("button", { name: dict.common.previous }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: dict.common.next }),
    ).toBeDisabled();
  });

  it("counts a second click before the URL catches up", async () => {
    // The URL and the `page` prop deliberately stay put across both clicks:
    // that is exactly the window `useSearchParams()` leaves open, and the bug
    // was that both clicks did their arithmetic on the stale 1 — the second
    // `replace` rewrote the first with the same ?page=2.
    mockSearchParams = new URLSearchParams("");
    const user = userEvent.setup();
    renderWithProviders(
      <TablePagination page={1} totalPages={5} pageSize={20} />,
    );

    const next = screen.getByRole("button", { name: dict.common.next });
    await user.click(next);
    await user.click(next);

    expect(mockReplace).toHaveBeenNthCalledWith(1, "/products?page=2");
    expect(mockReplace).toHaveBeenNthCalledWith(2, "/products?page=3");
  });

  it("will not step past the last page, however fast it is clicked", async () => {
    mockSearchParams = new URLSearchParams("page=2");
    const user = userEvent.setup();
    renderWithProviders(
      <TablePagination page={2} totalPages={3} pageSize={20} />,
    );

    const next = screen.getByRole("button", { name: dict.common.next });
    await user.click(next);
    await user.click(next);

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/products?page=3");
  });

  it("carries the rows-per-page control, unless the caller's DTO caps it lower", () => {
    const { rerender } = renderWithProviders(
      <TablePagination page={1} totalPages={3} pageSize={20} />,
    );
    expect(
      screen.getByRole("combobox", { name: dict.common.table.pageSizeLabel }),
    ).toBeInTheDocument();

    rerender(
      <TablePagination page={1} totalPages={3} pageSize={20} hidePageSize />,
    );
    expect(
      screen.queryByRole("combobox", { name: dict.common.table.pageSizeLabel }),
    ).not.toBeInTheDocument();
  });
});
