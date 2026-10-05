/**
 * The «Скасувати» toast after a flat-list move (wave 198, TASK-963) — the
 * owner's «тост «Скасувати» після перетягування замість тьмяної кнопки».
 *
 * Driven through the REAL adapters (`usePageReorder` for the behaviour, all
 * five content adapters for the wiring), so what is pinned is what the widgets
 * get without passing anything new.
 */

import { useState } from "react";
import { http, HttpResponse } from "msw";
import {
  act,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { LiveAnnouncer, ReorderUndoButton } from "@/shared/ui";
import { resetReorderLock } from "@/shared/lib/reorder-lock";
import { applyIntent, type TreeItem } from "@/shared/lib/sortable-tree";
import type { ReorderLifecycleApi } from "@/shared/lib/list-reorder";
import { toast } from "@/shared/ui/toast";
import { useBannerReorder } from "./use-banner-reorder";
import { useBlogCategoryReorder } from "./use-blog-category-reorder";
import { useCarouselReorder } from "./use-carousel-reorder";
import { useFaqReorder } from "./use-faq-reorder";
import { usePageReorder } from "./use-page-reorder";
import { flatMovedToastMessage } from "./use-undo-toast-reorder";

// sonner renders nothing without a <Toaster>; spy instead (as the category tree does).
jest.mock("@/shared/ui/toast", () => ({
  UNDO_TOAST_DURATION_MS: 10_000,
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    undo: jest.fn(),
    dismiss: jest.fn(),
  },
}));
const undoToast = toast.undo as jest.Mock;
const dismissToast = toast.dismiss as jest.Mock;

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const ITEMS: TreeItem[] = [
  { id: A, parentId: null, label: "Гарантія" },
  { id: B, parentId: null, label: "Доставка" },
  { id: C, parentId: null, label: "Оплата" },
];

const d = dict.reorderList;

type UseAdapter = (options: { items: TreeItem[] }) => ReorderLifecycleApi;

function Harness({
  useAdapter,
  items = ITEMS,
}: {
  useAdapter: UseAdapter;
  items?: TreeItem[];
}) {
  const [list] = useState<TreeItem[]>(items);
  const reorder = useAdapter({ items: list });
  const moveFirstDown = () => {
    const id = reorder.items[0].id;
    const outcome = applyIntent(reorder.items, id, "down");
    if (outcome.kind === "moved") reorder.move(outcome.items, id);
  };
  return (
    <div>
      <button type="button" onClick={moveFirstDown}>
        move-first-down
      </button>
      <ReorderUndoButton
        canUndo={reorder.canUndo}
        onUndo={reorder.undo}
        label={d.undo}
      />
      <div data-testid="order">
        {reorder.items.map((i) => i.label).join(",")}
      </div>
    </div>
  );
}

function renderHarness(useAdapter: UseAdapter, items?: TreeItem[]) {
  return renderWithProviders(
    <LiveAnnouncer>
      <Harness useAdapter={useAdapter} items={items} />
    </LiveAnnouncer>,
  );
}

const moveFirstDown = () =>
  userEvent.click(screen.getByRole("button", { name: "move-first-down" }));
const persistentUndo = () => screen.getByRole("button", { name: d.undo });

/** Every PATCH body the endpoint received, in order. */
let bodies: unknown[] = [];

function mockReorder(path: string, status = 200) {
  server.use(
    http.patch(`*/api/admin/${path}/reorder`, async ({ request }) => {
      bodies.push(await request.json());
      return status === 200
        ? HttpResponse.json({ data: [] })
        : HttpResponse.json(
            { statusCode: status, error: "REORDER_DUPLICATE_ID", message: "x" },
            { status },
          );
    }),
  );
}

beforeEach(() => {
  resetReorderLock();
  bodies = [];
  let n = 0;
  undoToast.mockReset().mockImplementation(() => `undo-toast-${++n}`);
  dismissToast.mockClear();
});

describe("flatMovedToastMessage", () => {
  it("names the moved row and its new place as an ordinal of «місце»", () => {
    const next = [ITEMS[1], ITEMS[0], ITEMS[2]];
    expect(flatMovedToastMessage(next, A)).toBe(
      "«Гарантія» переміщено на друге місце.",
    );
  });

  it("falls back to «позиція N з M» past the tenth place", () => {
    const many: TreeItem[] = Array.from({ length: 12 }, (_, i) => ({
      id: `id-${i}`,
      parentId: null,
      label: `Рядок ${i + 1}`,
    }));
    expect(flatMovedToastMessage(many, "id-11")).toBe(
      "«Рядок 12» переміщено: позиція 12 з 12.",
    );
  });

  it("is the neutral «Порядок змінено.» when the row has no label", () => {
    const next: TreeItem[] = [
      { id: B, parentId: null, label: "Доставка" },
      { id: A, parentId: null, label: "" },
    ];
    expect(flatMovedToastMessage(next, A)).toBe(d.movedToast.neutral);
    expect(flatMovedToastMessage(next, "missing")).toBe(d.movedToast.neutral);
  });
});

describe("flat-list reorder — the «Скасувати» toast (wave 198, TASK-963)", () => {
  it("a committed move posts ONE undo toast; its action replays the SAME inverse payload as the persistent control", async () => {
    mockReorder("pages");
    renderHarness(usePageReorder);

    await moveFirstDown();
    await waitFor(() => expect(undoToast).toHaveBeenCalledTimes(1));
    const [message, options] = undoToast.mock.calls[0] as [
      string,
      { onUndo: () => void },
    ];
    expect(message).toBe("«Гарантія» переміщено на друге місце.");
    expect(bodies[0]).toEqual({ orderedIds: [B, A, C] });

    await waitFor(() =>
      expect(persistentUndo()).toHaveAttribute("aria-disabled", "false"),
    );
    // What sonner does when the operator clicks the toast's «Скасувати».
    act(() => options.onUndo());

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ orderedIds: [A, B, C] });
    // Using the toast's undo retires the toast; the undo itself posts no new one.
    expect(dismissToast).toHaveBeenCalledWith("undo-toast-1");
    expect(undoToast).toHaveBeenCalledTimes(1);
    // …and the persistent control goes unavailable — there is nothing left to undo.
    await waitFor(() =>
      expect(persistentUndo()).toHaveAttribute("aria-disabled", "true"),
    );
  });

  it("the PERSISTENT control still undoes (and stays in the tab order) and dismisses the toast offering the same undo", async () => {
    mockReorder("pages");
    renderHarness(usePageReorder);

    const undo = persistentUndo();
    expect(undo).toHaveAttribute("aria-disabled", "true");
    expect(undo).not.toBeDisabled();

    await moveFirstDown();
    await waitFor(() => expect(undoToast).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(undo).toHaveAttribute("aria-disabled", "false"));
    await userEvent.click(undo);

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ orderedIds: [A, B, C] });
    expect(dismissToast).toHaveBeenCalledWith("undo-toast-1");
    expect(undoToast).toHaveBeenCalledTimes(1);
  });

  it("only ONE undo toast is live: a newer move dismisses the older toast first", async () => {
    mockReorder("pages");
    renderHarness(usePageReorder);

    await moveFirstDown();
    await waitFor(() => expect(undoToast).toHaveBeenCalledTimes(1));
    // Settled (the persistent control is live only once nothing is saving).
    await waitFor(() =>
      expect(persistentUndo()).toHaveAttribute("aria-disabled", "false"),
    );
    // The harness does not re-feed the server list, so the second move is
    // computed against the original order again — any real change will do.
    await moveFirstDown();
    await waitFor(() => expect(undoToast).toHaveBeenCalledTimes(2));
    expect(dismissToast).toHaveBeenCalledWith("undo-toast-1");
  });

  it("only ONE undo toast is live across two lists (two banner placements)", async () => {
    mockReorder("banners");
    const useHero: UseAdapter = ({ items }) =>
      useBannerReorder({ placement: "HERO_SLIDE", items });
    const usePromo: UseAdapter = ({ items }) =>
      useBannerReorder({ placement: "PROMO_TILE", items });
    renderWithProviders(
      <LiveAnnouncer>
        <section aria-label="hero">
          <Harness useAdapter={useHero} />
        </section>
        <section aria-label="promo">
          <Harness useAdapter={usePromo} />
        </section>
      </LiveAnnouncer>,
    );
    const [heroMove, promoMove] = screen.getAllByRole("button", {
      name: "move-first-down",
    });

    await userEvent.click(heroMove);
    await waitFor(() => expect(undoToast).toHaveBeenCalledTimes(1));
    // The lock is per resource; wait for the first PATCH to settle.
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: d.undo })[0],
      ).toHaveAttribute("aria-disabled", "false"),
    );
    await userEvent.click(promoMove);
    await waitFor(() => expect(undoToast).toHaveBeenCalledTimes(2));
    expect(dismissToast).toHaveBeenCalledWith("undo-toast-1");
  });

  it("a REJECTED move posts no undo toast", async () => {
    mockReorder("pages", 400);
    renderHarness(usePageReorder);

    await moveFirstDown();
    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() =>
      expect(
        screen.getByTestId("tree-live-assertive"),
      ).not.toBeEmptyDOMElement(),
    );
    expect(undoToast).not.toHaveBeenCalled();
  });

  it("unmounting the list retires its live toast", async () => {
    mockReorder("pages");
    const { unmount } = renderHarness(usePageReorder);

    await moveFirstDown();
    await waitFor(() => expect(undoToast).toHaveBeenCalledTimes(1));
    unmount();
    expect(dismissToast).toHaveBeenCalledWith("undo-toast-1");
  });

  it.each<[string, string, UseAdapter]>([
    ["pages", "pages", usePageReorder],
    ["FAQ", "faq", useFaqReorder],
    ["blog categories", "blog/categories", useBlogCategoryReorder],
    [
      "banners",
      "banners",
      ({ items }) => useBannerReorder({ placement: "HERO_SLIDE", items }),
    ],
    [
      "carousels",
      "carousels",
      ({ items }) => useCarouselReorder({ placement: "HOME_RAILS", items }),
    ],
  ])(
    "%s: a move posts the undo toast with no widget change",
    async (_, path, useAdapter) => {
      mockReorder(path);
      renderHarness(useAdapter);

      await moveFirstDown();
      await waitFor(() => expect(undoToast).toHaveBeenCalledTimes(1));
      expect(undoToast.mock.calls[0][0]).toBe(
        "«Гарантія» переміщено на друге місце.",
      );
    },
  );
});
