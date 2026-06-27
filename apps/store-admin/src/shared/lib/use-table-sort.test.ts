import { renderHook, act } from "@/shared/test/render";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { useTableSort } from "./use-table-sort";

const sp = (init = ""): ReadonlyURLSearchParams =>
  new URLSearchParams(init) as unknown as ReadonlyURLSearchParams;

describe("useTableSort", () => {
  it("returns the defaults when no URL params are present", () => {
    const { result } = renderHook(() => useTableSort(sp(), jest.fn()));
    expect(result.current.sortBy).toBe("createdAt");
    expect(result.current.sortOrder).toBe("desc");
  });

  it("reads sortBy/sortOrder from the URL", () => {
    const { result } = renderHook(() =>
      useTableSort(sp("sortBy=email&sortOrder=asc"), jest.fn()),
    );
    expect(result.current.sortBy).toBe("email");
    expect(result.current.sortOrder).toBe("asc");
  });

  it("respects custom defaults", () => {
    const { result } = renderHook(() =>
      useTableSort(sp(), jest.fn(), "name", "asc"),
    );
    expect(result.current.sortBy).toBe("name");
    expect(result.current.sortOrder).toBe("asc");
  });

  it("toggles the order on the active field and resets page", () => {
    const update = jest.fn();
    const { result } = renderHook(() =>
      useTableSort(sp("sortBy=createdAt&sortOrder=desc"), update),
    );
    act(() => result.current.onSort("createdAt"));
    expect(update).toHaveBeenCalledWith({
      sortBy: "createdAt",
      sortOrder: "asc",
      page: undefined,
    });
  });

  it("sets a new field to desc and resets page", () => {
    const update = jest.fn();
    const { result } = renderHook(() =>
      useTableSort(sp("sortBy=email&sortOrder=asc"), update),
    );
    act(() => result.current.onSort("createdAt"));
    expect(update).toHaveBeenCalledWith({
      sortBy: "createdAt",
      sortOrder: "desc",
      page: undefined,
    });
  });
});
