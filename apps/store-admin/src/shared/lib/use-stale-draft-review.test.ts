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

  describe("a colleague's version still on its way (begin)", () => {
    const fresh = { notes: "колеги", waybill: "" };
    const draft = { notes: "моя", waybill: "" };

    it("opens the review when it arrives", () => {
      const { result } = setup(draft);

      const pending = result.current.begin();
      act(() => pending.open({ base: BASE, draft, fresh, version: "v2" }));

      expect(result.current.diverging).toEqual(["notes"]);
    });

    it("is ignored once the edit was closed meanwhile", () => {
      const { result, apply } = setup(draft);

      const pending = result.current.begin();
      act(() => result.current.close());
      act(() => pending.open({ base: BASE, draft, fresh, version: "v2" }));

      expect(result.current.pending).toBe(false);
      expect(apply).not.toHaveBeenCalled();
    });

    it("is ignored when a newer attempt started", () => {
      const { result } = setup(draft);

      const first = result.current.begin();
      act(() => {
        result.current.begin();
      });
      act(() => first.fail());

      expect(result.current.fetchFailed).toBe(false);
    });

    it("is ignored after the form unmounted", () => {
      const { result, unmount, apply } = setup(draft);

      const pending = result.current.begin();
      const before = result.current;
      unmount();
      pending.open({ base: BASE, draft, fresh, version: "v2" });

      expect(before.pending).toBe(false);
      expect(apply).not.toHaveBeenCalled();
    });

    it("says so when the version could not be fetched, until the next attempt or close", () => {
      const { result } = setup(draft);

      const pending = result.current.begin();
      act(() => pending.fail());
      expect(result.current.fetchFailed).toBe(true);
      expect(result.current.pending).toBe(false);

      act(() => {
        result.current.begin();
      });
      expect(result.current.fetchFailed).toBe(false);

      act(() => result.current.begin().fail());
      act(() => result.current.close());
      expect(result.current.fetchFailed).toBe(false);
    });

    it("keeps `close` stable across renders, so an effect may depend on it", () => {
      const { result, rerender } = setup(draft);
      const close = result.current.close;

      rerender({ draft: { notes: "інша", waybill: "" } });

      expect(result.current.close).toBe(close);
    });
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
