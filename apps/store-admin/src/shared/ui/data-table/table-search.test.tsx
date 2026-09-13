/**
 * `TableSearch` — the contract the whole TASK-423 migration rests on.
 *
 * Every assertion here is about WHAT WAS REQUESTED (the URL the component
 * replaced, or the needle it handed the parent) rather than what rendered: a
 * search box that looks right while writing the wrong param, or dropping the
 * page reset, renders identically and shows the operator rows from the previous
 * result set.
 *
 * The focus test is the one that would otherwise rot. A `key`-remount "fix" for
 * the state sync passes every other test in this file and destroys focus on
 * every keystroke — which is the bug TASK-117 removed from the storefront and
 * the reason docs/conventions/forms.md rule 1b exists.
 */

import {
  act,
  renderWithProviders,
  screen,
  userEvent,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import { TableSearch } from "./table-search";

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
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

/** `userEvent` with fake timers needs its own advance hook. */
function typist() {
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

function settle() {
  act(() => {
    jest.advanceTimersByTime(300);
  });
}

function box() {
  return screen.getByLabelText(dict.common.table.searchLabel);
}

describe("TableSearch — url mode", () => {
  it("writes the typed term to ?search= after the debounce, not before", async () => {
    const user = typist();
    renderWithProviders(<TableSearch value="" />);

    await user.type(box(), "кабель");
    // Still nothing: this is what makes it a search-as-you-type rather than a
    // navigation per keystroke.
    expect(mockReplace).not.toHaveBeenCalled();

    settle();
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(
      "/products?search=%D0%BA%D0%B0%D0%B1%D0%B5%D0%BB%D1%8C",
    );
  });

  it("drops the current page — a narrowed list renumbers its pages", async () => {
    mockSearchParams = new URLSearchParams("page=4&sortBy=name&sortOrder=asc");
    const user = typist();
    renderWithProviders(<TableSearch value="" />);

    await user.type(box(), "usb");
    settle();

    // `page` gone, the sort the operator chose kept — the merge semantic of
    // `useUrlParams` is exactly why this component does not build URLs itself.
    expect(mockReplace).toHaveBeenCalledWith(
      "/products?sortBy=name&sortOrder=asc&search=usb",
    );
  });

  it("writes one navigation for a burst of keystrokes", async () => {
    const user = typist();
    renderWithProviders(<TableSearch value="" />);

    await user.type(box(), "abc");
    settle();

    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it("trims, and treats whitespace as empty", async () => {
    const user = typist();
    renderWithProviders(<TableSearch value="" />);

    await user.type(box(), "  ");
    settle();
    // Nothing was committed: `"  "` normalises to the same `undefined` the field
    // started at, so there is no navigation to make.
    expect(mockReplace).not.toHaveBeenCalled();

    await user.type(box(), "usb  ");
    settle();
    expect(mockReplace).toHaveBeenCalledWith("/products?search=usb");
  });

  it("removes the param when the box is emptied", async () => {
    mockSearchParams = new URLSearchParams("search=usb");
    const user = typist();
    renderWithProviders(<TableSearch value="usb" />);

    await user.clear(box());
    settle();

    expect(mockReplace).toHaveBeenCalledWith("/products");
  });

  it("clears immediately on Escape — a command, not typing", async () => {
    mockSearchParams = new URLSearchParams("search=usb&page=2");
    const user = typist();
    renderWithProviders(<TableSearch value="usb" />);

    await user.click(box());
    await user.keyboard("{Escape}");

    // No timer advance: the clear must have landed synchronously.
    expect(mockReplace).toHaveBeenCalledWith("/products");
    expect(box()).toHaveValue("");
  });

  it("does nothing on Escape in an already-empty box", async () => {
    const user = typist();
    renderWithProviders(<TableSearch value="" />);

    await user.click(box());
    await user.keyboard("{Escape}");

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("kills the in-flight debounce on Escape — no resurrected term", async () => {
    mockSearchParams = new URLSearchParams("search=usb");
    const user = typist();
    renderWithProviders(<TableSearch value="usb" />);

    // The operator refines the committed term, then changes their mind while
    // the 300 ms window is still open.
    await user.type(box(), "-c");
    act(() => {
      jest.advanceTimersByTime(100);
    });
    await user.keyboard("{Escape}");

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/products");

    // The assertion that matters: nothing else lands once the abandoned window
    // would have elapsed. An uncancelled timer fired here with "usb-c", wrote
    // `?search=usb-c` and advanced `lastPushedRef` with it — so the re-seed
    // effect saw URL and ref agree and LEFT THE BOX EMPTY over a list filtered
    // by the term the operator had just cancelled.
    settle();
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(box()).toHaveValue("");
  });

  it("makes Escape silent — not dead — before the first commit", async () => {
    const user = typist();
    renderWithProviders(<TableSearch value="" />);

    await user.type(box(), "usb");
    act(() => {
      jest.advanceTimersByTime(100);
    });
    await user.keyboard("{Escape}");
    settle();

    // Nothing was ever committed, so there is nothing to clear — but the
    // pending timer must not sneak `?search=usb` in afterwards either, which is
    // what made Escape read as a dead key.
    expect(mockReplace).not.toHaveBeenCalled();
    expect(box()).toHaveValue("");
  });

  it("never commits a term abandoned inside one debounce window", async () => {
    const user = typist();
    renderWithProviders(<TableSearch value="" />);

    // Type and clear without ever letting the debounce fire — the shape of an
    // operator who starts typing, thinks better of it, and selects-all-deletes.
    await user.type(box(), "sa");
    await user.clear(box());
    settle();

    // The old keystroke-time guard compared the emptied box against
    // `lastPushedRef`, which the pending timer had not advanced yet, found them
    // equal, skipped the empty commit and left that timer standing: the list
    // narrowed to "sa" under an empty box.
    expect(mockReplace).not.toHaveBeenCalled();
    expect(box()).toHaveValue("");
  });

  it("honours a custom param name", async () => {
    const user = typist();
    renderWithProviders(<TableSearch value="" param="q" />);

    await user.type(box(), "usb");
    settle();

    expect(mockReplace).toHaveBeenCalledWith("/products?q=usb");
  });

  it("seeds from the URL so a pasted link shows its own term", () => {
    renderWithProviders(<TableSearch value="кабель" />);
    expect(box()).toHaveValue("кабель");
  });
});

describe("TableSearch — state sync (forms.md rule 1b)", () => {
  it("keeps DOM focus and the typed text across the URL echo", async () => {
    const user = typist();
    const { rerender } = renderWithProviders(<TableSearch value="" />);

    await user.type(box(), "usb");
    settle();

    // The app now re-renders with the URL it was just handed. A `key`-remount
    // would blow focus away here; the guard makes it a no-op.
    rerender(<TableSearch value="usb" />);

    expect(box()).toHaveFocus();
    expect(box()).toHaveValue("usb");
  });

  it("does not clobber in-progress typing with its own echo", async () => {
    const user = typist();
    const { rerender } = renderWithProviders(<TableSearch value="" />);

    await user.type(box(), "usb");
    settle();
    // The echo arrives while the operator keeps typing.
    await user.type(box(), "-c");
    rerender(<TableSearch value="usb" />);

    expect(box()).toHaveValue("usb-c");
  });

  it("re-seeds on a genuine external change (Clear filters, back/forward)", async () => {
    const user = typist();
    const { rerender } = renderWithProviders(<TableSearch value="usb" />);

    await user.type(box(), "-c");
    settle();
    // Something OUTSIDE this component reset the view.
    rerender(<TableSearch value="" />);

    expect(box()).toHaveValue("");
  });
});

describe("TableSearch — local mode", () => {
  it("reports the needle to the parent and never touches the URL", async () => {
    const onChange = jest.fn();
    const user = typist();
    renderWithProviders(
      <TableSearch value="" mode="local" onChange={onChange} />,
    );

    await user.type(box(), "hero");
    settle();

    expect(onChange).toHaveBeenCalledWith("hero");
    // The three unpaginated, drag-reorderable tables filter in memory. A URL
    // param here would claim the server narrowed the list, which is exactly the
    // claim that would let a partial ordering be PATCHed.
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("reports undefined — not an empty string — when emptied", async () => {
    const onChange = jest.fn();
    const user = typist();
    renderWithProviders(
      <TableSearch value="hero" mode="local" onChange={onChange} />,
    );

    await user.clear(box());
    settle();

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("clears on Escape in local mode too", async () => {
    const onChange = jest.fn();
    const user = typist();
    renderWithProviders(
      <TableSearch value="hero" mode="local" onChange={onChange} />,
    );

    await user.click(box());
    await user.keyboard("{Escape}");

    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
