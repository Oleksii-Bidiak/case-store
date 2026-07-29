import { act, renderHook } from "@testing-library/react";
import { useImportDecisions, type DecidableRow } from "./use-import-decisions";

const rows: DecidableRow[] = [
  {
    sourceSku: "A1",
    changes: [
      { field: "price", conflict: true },
      { field: "name", conflict: false },
    ],
  },
  { sourceSku: "A2", changes: [{ field: "description", conflict: false }] },
];

describe("useImportDecisions (TASK-360)", () => {
  // Everything starts ticked because the owner's rule is that the supplier file
  // wins by default; the state only ever records the exceptions.
  it("excludes nothing to begin with", () => {
    const { result } = renderHook(() => useImportDecisions());

    expect(result.current.isRowExcluded("A1")).toBe(false);
    expect(result.current.isFieldExcluded("A1", "price")).toBe(false);
    expect(result.current.toPayload()).toEqual({
      excludedSkus: [],
      excludedFields: {},
    });
  });

  it("toggles a single field without touching its siblings", () => {
    const { result } = renderHook(() => useImportDecisions());

    act(() => result.current.toggleField("A1", "price"));

    expect(result.current.isFieldExcluded("A1", "price")).toBe(true);
    expect(result.current.isFieldExcluded("A1", "name")).toBe(false);
    expect(result.current.toPayload().excludedFields).toEqual({
      A1: ["price"],
    });
  });

  it("drops an article from the payload once its last field is ticked back on", () => {
    const { result } = renderHook(() => useImportDecisions());

    act(() => result.current.toggleField("A1", "price"));
    act(() => result.current.toggleField("A1", "price"));

    expect(result.current.toPayload().excludedFields).toEqual({});
  });

  // Excluding a whole row has to imply excluding its fields, or a row unticked
  // at the top would still show its individual changes as ticked.
  it("treats every field of an excluded row as excluded", () => {
    const { result } = renderHook(() => useImportDecisions());

    act(() => result.current.toggleRow("A1"));

    expect(result.current.isRowExcluded("A1")).toBe(true);
    expect(result.current.isFieldExcluded("A1", "price")).toBe(true);
    expect(result.current.isFieldExcluded("A1", "name")).toBe(true);
    expect(result.current.toPayload().excludedSkus).toEqual(["A1"]);
  });

  it("unticks exactly the conflicting changes and nothing else", () => {
    const { result } = renderHook(() => useImportDecisions());

    act(() => result.current.excludeAllConflicts(rows));

    expect(result.current.isFieldExcluded("A1", "price")).toBe(true);
    expect(result.current.isFieldExcluded("A1", "name")).toBe(false);
    expect(result.current.isFieldExcluded("A2", "description")).toBe(false);
    expect(result.current.toPayload().excludedFields).toEqual({
      A1: ["price"],
    });
  });

  it("clears everything on reset, so a second upload starts clean", () => {
    const { result } = renderHook(() => useImportDecisions());

    act(() => result.current.toggleRow("A1"));
    act(() => result.current.toggleField("A2", "description"));
    act(() => result.current.reset());

    expect(result.current.toPayload()).toEqual({
      excludedSkus: [],
      excludedFields: {},
    });
  });
});
