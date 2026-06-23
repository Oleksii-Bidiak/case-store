import { useState } from "react";
import {
  renderWithProviders,
  screen,
  act,
  userEvent,
} from "@/shared/test/render";
import { SearchInput } from "./search-input";

/**
 * Mirrors the real URL round-trip: the value the component pushes via `onSearch`
 * is fed straight back as `initialValue`, exactly as `router.replace` →
 * `currentParams.search` does in production.
 */
function Harness() {
  const [searchParam, setSearchParam] = useState("");
  return (
    <SearchInput
      initialValue={searchParam}
      onSearch={(value) => setSearchParam(value ?? "")}
    />
  );
}

describe("SearchInput", () => {
  afterEach(() => jest.useRealTimers());

  it("updates the visible value immediately on every keystroke", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderWithProviders(<SearchInput initialValue="" onSearch={jest.fn()} />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "a");

    // No timer advance — the controlled value reflects the keystroke at once.
    expect(input).toHaveValue("a");
  });

  it("collapses rapid keystrokes into a single debounced onSearch call", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onSearch = jest.fn();

    renderWithProviders(<SearchInput initialValue="" onSearch={onSearch} />);
    await user.type(screen.getByRole("searchbox"), "abc");

    act(() => jest.advanceTimersByTime(299));
    expect(onSearch).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("abc");
  });

  it("retains focus after the URL echo re-renders the parent (regression)", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderWithProviders(<Harness />);
    const input = screen.getByRole("searchbox");
    await user.click(input);
    await user.type(input, "x");

    expect(input).toHaveFocus();

    // Debounce fires → onSearch → Harness re-renders with initialValue="x".
    // Before the fix this remounted the input via `key` and dropped focus.
    act(() => jest.advanceTimersByTime(300));

    expect(input).toHaveFocus();
    expect(input).toHaveValue("x");
  });

  it("clears the field on an external initialValue reset without self-firing onSearch", () => {
    const onSearch = jest.fn();
    const { rerender } = renderWithProviders(
      <SearchInput initialValue="iphone" onSearch={onSearch} />,
    );
    expect(screen.getByRole("searchbox")).toHaveValue("iphone");

    // Simulates the "Clear filters" button: the parent pushes an empty search.
    rerender(<SearchInput initialValue="" onSearch={onSearch} />);

    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(onSearch).not.toHaveBeenCalled();
  });
});
