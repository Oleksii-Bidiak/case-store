import { renderHook, act } from "@/shared/test/render";
import { useUrlParams } from "./use-url-params";

/**
 * TASK-582: the merge semantic of `useUrlParams` is the one piece every admin
 * table (23 of them after TASK-423) writes its view state through, yet until now
 * it was covered only indirectly — by consumers that mock the router wholesale
 * and assert the final URL. These tests pin the unit itself.
 */
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockPathnameRef = { current: "/orders" };
const mockSearchParamsRef = { current: new URLSearchParams("") };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => mockPathnameRef.current,
  useSearchParams: () => mockSearchParamsRef.current,
}));

function renderWithUrl(query: string, pathname = "/orders") {
  mockPathnameRef.current = pathname;
  mockSearchParamsRef.current = new URLSearchParams(query);
  return renderHook(() => useUrlParams());
}

/** The single URL handed to `router.replace`, split for order-free asserts. */
function replacedUrl(): { pathname: string; params: URLSearchParams } {
  expect(mockReplace).toHaveBeenCalledTimes(1);
  const url = mockReplace.mock.calls[0][0] as string;
  const [pathname, query = ""] = url.split("?");
  return { pathname, params: new URLSearchParams(query) };
}

describe("useUrlParams", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
  });

  it("sets a key that has a value", () => {
    const { result } = renderWithUrl("");
    act(() => result.current({ status: "PENDING" }));
    expect(mockReplace).toHaveBeenCalledWith("/orders?status=PENDING");
  });

  it("overwrites a key that is already in the URL", () => {
    const { result } = renderWithUrl("page=3");
    act(() => result.current({ page: "4" }));
    expect(mockReplace).toHaveBeenCalledWith("/orders?page=4");
  });

  it("removes a key patched with undefined", () => {
    const { result } = renderWithUrl("status=PENDING&page=2");
    act(() => result.current({ page: undefined }));
    expect(mockReplace).toHaveBeenCalledWith("/orders?status=PENDING");
  });

  it('removes a key patched with an empty string ""', () => {
    const { result } = renderWithUrl("search=case&page=2");
    act(() => result.current({ search: "" }));
    expect(mockReplace).toHaveBeenCalledWith("/orders?page=2");
  });

  it("leaves every key not mentioned in the patch untouched", () => {
    const { result } = renderWithUrl(
      "search=case&sortBy=total&sortOrder=asc&page=5",
    );
    // A table changes one control at a time: writing the filter (and resetting
    // the page) must never drop the search or the sort the operator chose.
    act(() => result.current({ status: "PAID", page: undefined }));

    const { pathname, params } = replacedUrl();
    expect(pathname).toBe("/orders");
    expect(Object.fromEntries(params)).toEqual({
      search: "case",
      sortBy: "total",
      sortOrder: "asc",
      status: "PAID",
    });
  });

  it("applies several sets and deletes from one patch at once", () => {
    const { result } = renderWithUrl("a=1&b=2&c=3");
    act(() => result.current({ a: undefined, b: "", c: "30", d: "4" }));

    const { params } = replacedUrl();
    expect(Object.fromEntries(params)).toEqual({ c: "30", d: "4" });
  });

  it("navigates to the bare pathname when the last key is removed", () => {
    const { result } = renderWithUrl("search=case", "/reviews");
    act(() => result.current({ search: undefined }));
    // No dangling `?` — `/reviews?` would be a different history entry.
    expect(mockReplace).toHaveBeenCalledWith("/reviews");
  });

  it("navigates to the bare pathname for an empty patch on an empty URL", () => {
    const { result } = renderWithUrl("", "/brands");
    act(() => result.current({}));
    expect(mockReplace).toHaveBeenCalledWith("/brands");
  });

  it("URL-encodes values it writes", () => {
    const { result } = renderWithUrl("");
    act(() => result.current({ search: "чохол & скло" }));

    const { params } = replacedUrl();
    expect(params.get("search")).toBe("чохол & скло");
  });

  it("always replaces and never pushes — view state is not navigation", () => {
    const { result } = renderWithUrl("");
    act(() => result.current({ page: "2" }));
    act(() => result.current({ page: "3" }));
    expect(mockReplace).toHaveBeenCalledTimes(2);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("does not mutate the search params it read from", () => {
    const { result } = renderWithUrl("page=2");
    const before = mockSearchParamsRef.current;
    act(() => result.current({ page: undefined, status: "PAID" }));
    expect(before.toString()).toBe("page=2");
  });
});
