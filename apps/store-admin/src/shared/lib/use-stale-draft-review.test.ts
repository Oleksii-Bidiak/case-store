import { act, renderHook } from "@testing-library/react";
import { useStaleDraftReview } from "./use-stale-draft-review";

type Values = { notes: string; waybill: string };

const BASE: Values = { notes: "", waybill: "" };

function setup(initialDraft: Values) {
  const apply = jest.fn<void, [keyof Values, string]>();
  const rebase = jest.fn<void, [string, Values]>();
  const hook = renderHook(
    ({ draft }: { draft: Values }) =>
      useStaleDraftReview<Values>({ draft, apply, rebase }),
    { initialProps: { draft: initialDraft } },
  );
  return { ...hook, apply, rebase };
}

describe("useStaleDraftReview (TASK-1972)", () => {
  it("is idle until a conflict is opened", () => {
    const { result } = setup(BASE);

    expect(result.current.pending).toBe(false);
    expect(result.current.review).toBeNull();
    expect(result.current.diverging).toEqual([]);
  });

  it("lists a field both sides changed, differently, as diverging", () => {
    const draft = { notes: "моя", waybill: "" };
    const { result, apply, rebase } = setup(draft);

    act(() =>
      result.current.open({
        base: BASE,
        draft,
        fresh: { notes: "колеги", waybill: "" },
        version: "v2",
      }),
    );

    expect(result.current.pending).toBe(true);
    expect(result.current.diverging).toEqual(["notes"]);
    expect(result.current.review?.fresh.notes).toBe("колеги");
    // Nothing is decided for the operator.
    expect(apply).not.toHaveBeenCalled();
    expect(rebase).not.toHaveBeenCalled();
  });

  it("refreshes a field only the colleague changed, without calling it diverging", () => {
    const draft = { notes: "моя", waybill: "" };
    const { result, apply, rebase } = setup(draft);

    act(() =>
      result.current.open({
        base: BASE,
        draft,
        fresh: { notes: "", waybill: "20450000000001" },
        version: "v2",
      }),
    );

    expect(apply).toHaveBeenCalledWith("waybill", "20450000000001");
    expect(apply).not.toHaveBeenCalledWith("notes", expect.anything());
    expect(result.current.diverging).toEqual([]);
    // Still pending: the token moves only on the operator's word.
    expect(result.current.pending).toBe(true);
    expect(rebase).not.toHaveBeenCalled();
  });

  it("does not count a field where both sides typed the same thing", () => {
    const draft = { notes: "те саме", waybill: "" };
    const { result } = setup(draft);

    act(() =>
      result.current.open({
        base: BASE,
        draft,
        fresh: { notes: "те саме", waybill: "" },
        version: "v2",
      }),
    );

    expect(result.current.diverging).toEqual([]);
  });

  it("drops a field from the list once the draft matches the colleague's value", () => {
    const draft = { notes: "моя", waybill: "" };
    const { result, rerender } = setup(draft);
    act(() =>
      result.current.open({
        base: BASE,
        draft,
        fresh: { notes: "колеги", waybill: "" },
        version: "v2",
      }),
    );

    rerender({ draft: { notes: "колеги", waybill: "" } });

    expect(result.current.diverging).toEqual([]);
    expect(result.current.pending).toBe(true);
  });

  it("takeTheirs writes the colleague's value into the field", () => {
    const draft = { notes: "моя", waybill: "" };
    const { result, apply, rebase } = setup(draft);
    act(() =>
      result.current.open({
        base: BASE,
        draft,
        fresh: { notes: "колеги", waybill: "" },
        version: "v2",
      }),
    );

    act(() => result.current.takeTheirs("notes"));

    expect(apply).toHaveBeenCalledWith("notes", "колеги");
    expect(rebase).not.toHaveBeenCalled();
  });

  it("acknowledge rebases onto the reviewed version and closes the review", () => {
    const draft = { notes: "моя", waybill: "" };
    const fresh = { notes: "колеги", waybill: "" };
    const { result, rebase } = setup(draft);
    act(() => result.current.open({ base: BASE, draft, fresh, version: "v2" }));

    act(() => result.current.acknowledge());

    expect(rebase).toHaveBeenCalledWith("v2", fresh);
    expect(result.current.pending).toBe(false);
    expect(result.current.review).toBeNull();
  });

  it("close drops the review without moving the token", () => {
    const draft = { notes: "моя", waybill: "" };
    const { result, rebase } = setup(draft);
    act(() =>
      result.current.open({
        base: BASE,
        draft,
        fresh: { notes: "колеги", waybill: "" },
        version: "v2",
      }),
    );

    act(() => result.current.close());

    expect(result.current.pending).toBe(false);
    expect(rebase).not.toHaveBeenCalled();
  });
});
