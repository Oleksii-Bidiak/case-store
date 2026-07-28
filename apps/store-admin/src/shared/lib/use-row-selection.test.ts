import { renderHook, act } from "@/shared/test/render";
import {
  useRowSelection,
  type RowSelectionMessages,
} from "./use-row-selection";

const PAGE_1 = ["a", "b", "c", "d"];
const PAGE_2 = ["e", "f"];

const messages: RowSelectionMessages = {
  selected: (label, count) => `selected ${label} (${count})`,
  deselected: (label, count) => `deselected ${label} (${count})`,
  selectedAll: (count) => `selectedAll (${count})`,
  cleared: "cleared",
};

const setup = (rowIds: readonly string[] = PAGE_1) =>
  renderHook(
    ({ ids }: { ids: readonly string[] }) =>
      useRowSelection({ rowIds: ids, messages }),
    { initialProps: { ids: rowIds } },
  );

describe("useRowSelection", () => {
  it("starts empty with an unchecked header", () => {
    const { result } = setup();
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.headerChecked).toBe(false);
  });

  it("toggles a row on and off", () => {
    const { result } = setup();

    act(() => result.current.toggle("b"));
    expect(result.current.isSelected("b")).toBe(true);
    expect(result.current.selectedCount).toBe(1);

    act(() => result.current.toggle("b"));
    expect(result.current.isSelected("b")).toBe(false);
    expect(result.current.selectedCount).toBe(0);
  });

  describe("header tri-state", () => {
    it("is indeterminate on a partial selection", () => {
      const { result } = setup();
      act(() => result.current.toggle("a"));
      expect(result.current.headerChecked).toBe("indeterminate");
    });

    it("is true only when every row on the page is selected", () => {
      const { result } = setup();
      act(() => result.current.toggleAll());
      expect(result.current.headerChecked).toBe(true);
      expect(result.current.selectedCount).toBe(PAGE_1.length);
    });

    it("stays false on an empty page rather than reading as 'all selected'", () => {
      const { result } = setup([]);
      expect(result.current.headerChecked).toBe(false);
    });
  });

  it("toggleAll clears the page when everything on it is already selected", () => {
    const { result } = setup();
    act(() => result.current.toggleAll());
    act(() => result.current.toggleAll());
    expect(result.current.selectedCount).toBe(0);
  });

  describe("Shift range", () => {
    it("grows from the anchor, not from the last row touched", () => {
      const { result } = setup();

      // Anchor at "a", then move focus to "c" by toggling it — the anchor moves
      // with each toggle, so anchor is now "c".
      act(() => result.current.toggle("a"));
      act(() => result.current.toggle("c"));

      // Sweeping down from "c" must cover c..d, NOT a..d.
      let focus: string | null = null;
      act(() => {
        focus = result.current.extend("c", 1);
      });

      expect(focus).toBe("d");
      expect([...result.current.selectedIds].sort()).toEqual(["c", "d"]);
    });

    it("returns the id to focus and replaces the page selection", () => {
      const { result } = setup();
      act(() => result.current.toggle("a"));

      let focus: string | null = null;
      act(() => {
        focus = result.current.extend("a", 1);
      });
      expect(focus).toBe("b");
      expect([...result.current.selectedIds].sort()).toEqual(["a", "b"]);

      act(() => {
        focus = result.current.extend("b", 1);
      });
      expect(focus).toBe("c");
      expect([...result.current.selectedIds].sort()).toEqual(["a", "b", "c"]);
    });

    it("shrinks back when the sweep reverses", () => {
      const { result } = setup();
      act(() => result.current.toggle("a"));
      act(() => result.current.extend("a", 1));
      act(() => result.current.extend("b", 1));
      expect(result.current.selectedCount).toBe(3);

      act(() => result.current.extend("c", -1));
      expect([...result.current.selectedIds].sort()).toEqual(["a", "b"]);
    });

    it("returns null at the ends of the list and changes nothing", () => {
      const { result } = setup();
      act(() => result.current.toggle("a"));

      let focus: string | null = "unset";
      act(() => {
        focus = result.current.extend("a", -1);
      });
      expect(focus).toBeNull();
      expect([...result.current.selectedIds]).toEqual(["a"]);
    });

    it("ignores an id that is not on the page", () => {
      const { result } = setup();
      let focus: string | null = "unset";
      act(() => {
        focus = result.current.extend("zzz", 1);
      });
      expect(focus).toBeNull();
      expect(result.current.selectedCount).toBe(0);
    });
  });

  describe("extendTo (Shift+click / Shift+Space)", () => {
    it("selects the whole span between the anchor and the target", () => {
      const { result } = setup();

      act(() => result.current.toggle("a")); // anchor
      act(() => result.current.extendTo("d"));

      expect([...result.current.selectedIds].sort()).toEqual([
        "a",
        "b",
        "c",
        "d",
      ]);
    });

    it("works upwards as well as downwards", () => {
      const { result } = setup();

      act(() => result.current.toggle("d"));
      act(() => result.current.extendTo("b"));

      expect([...result.current.selectedIds].sort()).toEqual(["b", "c", "d"]);
    });

    it("keeps the anchor put so the range can be re-swept smaller", () => {
      const { result } = setup();

      act(() => result.current.toggle("a"));
      act(() => result.current.extendTo("d"));
      act(() => result.current.extendTo("b"));

      // Still anchored at "a" — a second Shift+click narrows the range rather
      // than starting a new one from the previous target.
      expect([...result.current.selectedIds].sort()).toEqual(["a", "b"]);
    });

    it("falls back to a plain toggle when there is no anchor yet", () => {
      const { result } = setup();

      act(() => result.current.extendTo("c"));

      expect([...result.current.selectedIds]).toEqual(["c"]);
    });

    it("stays checked when the range lands on an already-selected row", () => {
      const { result } = setup();

      act(() => result.current.toggle("a"));
      act(() => result.current.extendTo("c"));
      act(() => result.current.extendTo("c"));

      expect(result.current.isSelected("c")).toBe(true);
    });

    it("ignores a target that is not on the page", () => {
      const { result } = setup();

      act(() => result.current.toggle("a"));
      act(() => result.current.extendTo("zzz"));

      expect([...result.current.selectedIds]).toEqual(["a"]);
    });
  });

  describe("rows that leave the page", () => {
    it("does not expose a selected row that is no longer rendered", () => {
      const { result, rerender } = setup();

      act(() => result.current.toggle("a"));
      act(() => result.current.toggle("b"));
      expect(result.current.selectedCount).toBe(2);

      // Page 2: nothing selected here, so no bulk action can touch a or b.
      rerender({ ids: PAGE_2 });
      expect(result.current.selectedCount).toBe(0);
      expect(result.current.isSelected("a")).toBe(false);
      expect(result.current.headerChecked).toBe(false);
    });

    it("restores the selection when the operator comes back", () => {
      const { result, rerender } = setup();

      act(() => result.current.toggle("a"));
      rerender({ ids: PAGE_2 });
      rerender({ ids: PAGE_1 });

      expect(result.current.isSelected("a")).toBe(true);
      expect(result.current.selectedCount).toBe(1);
    });

    it("keeps other pages out of the header count", () => {
      const { result, rerender } = setup();

      act(() => result.current.toggleAll()); // all of page 1
      rerender({ ids: PAGE_2 });
      act(() => result.current.toggleAll()); // all of page 2

      // Header reflects page 2 only, not the 6 rows remembered in total.
      expect(result.current.headerChecked).toBe(true);
      expect(result.current.selectedCount).toBe(PAGE_2.length);
    });

    it("a sweep on one page does not disturb another page's selection", () => {
      const { result, rerender } = setup();

      act(() => result.current.toggle("a"));
      rerender({ ids: PAGE_2 });
      act(() => result.current.toggle("e"));
      act(() => result.current.extend("e", 1));
      expect([...result.current.selectedIds].sort()).toEqual(["e", "f"]);

      rerender({ ids: PAGE_1 });
      expect(result.current.isSelected("a")).toBe(true);
    });
  });

  it("clear drops rows remembered from other pages too", () => {
    const { result, rerender } = setup();

    act(() => result.current.toggle("a"));
    rerender({ ids: PAGE_2 });
    act(() => result.current.clear());
    rerender({ ids: PAGE_1 });

    expect(result.current.selectedCount).toBe(0);
  });
});
