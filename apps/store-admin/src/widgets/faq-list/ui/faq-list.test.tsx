/**
 * `AdminFaqTable` — the sortable FAQ list (TASK-242; reordering in TASK-428;
 * accordion rows, views, «⋯» and the form dialog of wave 198 — FaqProposal
 * ЧП1–ЧП8, TASK-1075).
 *
 * KEYBOARD-ONLY moves, by design: jsdom has no layout, so dnd-kit's collision detection
 * cannot run. Pointer correctness rests on the pointer path sharing ONE `applyMove()`
 * reducer with the keyboard path (pinned in `shared/lib/sortable-tree`).
 */

import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { PERM } from "@/entities/permission";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { resetReorderLock } from "@/shared/lib/reorder-lock";
import { AdminFaqTable } from "./faq-list";

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/faq",
  useSearchParams: () => mockSearchParams,
}));

const d = dict.faq;

/* ─────────────────────────────── fixtures ──────────────────────────────── */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const QUESTIONS: Record<string, string> = {
  [A]: "Скільки коштує доставка?",
  [B]: "Яка гарантія на техніку?",
  [C]: "Чи можна повернути товар?",
};
const ANSWERS: Record<string, string> = {
  [A]: "Безкоштовно від 1 000 ₴.",
  [B]: "Офіційна гарантія виробника.",
  [C]: "Так, протягом 14 днів.",
};

const DEFAULT_ORDER = [A, B, C];

function listResponse(order: string[] = DEFAULT_ORDER) {
  return {
    data: order.map((id, i) => ({
      id,
      question: QUESTIONS[id],
      answer: ANSWERS[id],
      sortOrder: i,
      // The middle question is hidden — the status badges are asserted below.
      isActive: id !== B,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })),
    meta: { total: order.length, page: 1, limit: order.length, totalPages: 1 },
  };
}

/** Every PATCH body the widget sent, in order. */
let bodies: unknown[] = [];
/** GET count — the "resyncs from the response alone" assertion reads it. */
let listCalls = 0;

/** The endpoint returns the FULL refreshed list, exactly as the real one does. */
function mockReorder(
  respond: () => Response | Promise<Response> = () =>
    HttpResponse.json(listResponse([B, A, C])),
) {
  server.use(
    http.get("*/api/admin/faq", () => {
      listCalls += 1;
      return HttpResponse.json(listResponse());
    }),
    http.patch("*/api/admin/faq/reorder", async ({ request }) => {
      bodies.push(await request.json());
      return respond();
    }),
  );
}

beforeEach(() => {
  resetReorderLock();
  bodies = [];
  listCalls = 0;
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams("");
});

/* ─────────────────────────────── DOM helpers ───────────────────────────── */

const rowEl = (id: string): HTMLTableRowElement => {
  const el = document.getElementById(`faq-row-${id}`);
  if (!el) throw new Error(`row ${QUESTIONS[id] ?? id} is not rendered`);
  return el as HTMLTableRowElement;
};

const rowIds = (): string[] =>
  Array.from(
    document.querySelectorAll<HTMLTableRowElement>("tr[id^='faq-row-']"),
  ).map((row) => row.id.replace("faq-row-", ""));

const polite = () => screen.getByTestId("tree-live-polite").textContent ?? "";
const assertive = () =>
  screen.getByTestId("tree-live-assertive").textContent ?? "";

type Props = React.ComponentProps<typeof AdminFaqTable>;

function renderTable(options: { permissions?: string[]; props?: Props } = {}) {
  const table = <AdminFaqTable {...(options.props ?? {})} />;
  return renderWithProviders(
    options.permissions ? (
      <WithAuth permissions={options.permissions}>{table}</WithAuth>
    ) : (
      <WithAuth isOwner>{table}</WithAuth>
    ),
  );
}

async function renderGrid(options: { permissions?: string[] } = {}) {
  const result = renderTable(options);
  await screen.findByRole("grid", { name: d.gridLabel });
  await waitFor(() => expect(rowIds()).toHaveLength(3));
  return result;
}

/** Keyboard: pick up, move up one slot, drop. */
function keyboardMoveUp(id: string) {
  rowEl(id).focus();
  fireEvent.keyDown(rowEl(id), { key: " " });
  fireEvent.keyDown(rowEl(id), { key: "ArrowUp" });
  fireEvent.keyDown(rowEl(id), { key: " " });
}

const searchBox = () => screen.getByRole("searchbox", { name: d.searchLabel });
const view = (label: string) =>
  screen.getByRole("tab", { name: new RegExp(`^${label}`) });

async function openRowMenu(id: string) {
  await userEvent.click(
    within(rowEl(id)).getByRole("button", {
      name: d.rowActionsAria(QUESTIONS[id]),
    }),
  );
  return screen.findByRole("menu");
}

/* ──────────────────────────────── the suite ────────────────────────────── */

describe("AdminFaqTable — header (ЧП1)", () => {
  it("says where the list shows and links /info on the site", async () => {
    mockReorder();
    await renderGrid();

    expect(
      screen.getByRole("heading", { level: 2, name: d.heading }),
    ).toBeInTheDocument();
    const info = screen.getByRole("link", { name: d.infoLinkAria });
    expect(info).toHaveAttribute("href", `${STOREFRONT_URL}/info`);
    expect(info).toHaveAttribute("target", "_blank");
  });

  it("«Додати запитання» opens the form in a dialog over the list", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.click(screen.getByRole("button", { name: d.add }));

    expect(
      await screen.findByRole("dialog", { name: d.createHeading }),
    ).toBeInTheDocument();
    // The list stays underneath.
    expect(rowIds()).toHaveLength(3);
  });
});

describe("AdminFaqTable — accordion rows (ЧП1)", () => {
  it("renders the question, the start of the answer and the status", async () => {
    mockReorder();
    await renderGrid();

    expect(within(rowEl(A)).getByText(QUESTIONS[A])).toBeInTheDocument();
    expect(within(rowEl(A)).getByText(ANSWERS[A])).toBeInTheDocument();
    expect(screen.getAllByText(d.statusActive)).toHaveLength(2);
    expect(within(rowEl(B)).getByText(d.statusInactive)).toBeInTheDocument();
  });

  it("a click on the row expands the answer; the chevron says so", async () => {
    mockReorder();
    await renderGrid();

    const toggle = within(rowEl(C)).getByRole("button", {
      name: d.answerToggleAria(QUESTIONS[C]),
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(within(rowEl(C)).getByText(QUESTIONS[C]));
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("has NO sort-order column any more — the row order IS the order", async () => {
    mockReorder();
    await renderGrid();

    expect(screen.queryByText("Порядок")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no items", async () => {
    server.use(
      http.get("*/api/admin/faq", () =>
        HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, limit: 0, totalPages: 0 },
        }),
      ),
    );

    renderTable();

    expect(await screen.findByText(d.empty)).toBeInTheDocument();
  });

  it("shows the error state when the request fails, keeping refresh reachable", async () => {
    server.use(
      http.get(
        "*/api/admin/faq",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    renderTable();

    expect(await screen.findByText(d.loadError)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    ).toBeInTheDocument();
  });
});

describe("AdminFaqTable — «⋯» (ЧП1, ЧП6)", () => {
  it("«Редагувати» opens the dialog with the item", async () => {
    mockReorder();
    await renderGrid();

    const menu = await openRowMenu(A);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: dict.common.edit }),
    );

    const dialog = await screen.findByRole("dialog", { name: d.editHeading });
    await waitFor(() =>
      expect(
        within(dialog).getByRole("textbox", { name: dict.faqForm.question }),
      ).toHaveValue(QUESTIONS[A]),
    );
  });

  it("«Приховати» / «Показати» flips isActive through PUT", async () => {
    mockReorder();
    const sent: unknown[] = [];
    server.use(
      http.put("*/api/admin/faq/:id", async ({ request, params }) => {
        sent.push({ id: params.id, body: await request.json() });
        return HttpResponse.json({ data: listResponse().data[0] });
      }),
    );
    await renderGrid();

    let menu = await openRowMenu(A);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: d.deactivate }),
    );
    await waitFor(() =>
      expect(sent).toContainEqual({ id: A, body: { isActive: false } }),
    );

    menu = await openRowMenu(B);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: d.activate }),
    );
    await waitFor(() =>
      expect(sent).toContainEqual({ id: B, body: { isActive: true } }),
    );
  });

  it("«Видалити…» asks in an AlertDialog that advises «Приховати», then deletes", async () => {
    mockReorder();
    let deleted = "";
    server.use(
      http.delete("*/api/admin/faq/:id", ({ params }) => {
        deleted = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderGrid();

    const menu = await openRowMenu(B);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: d.deleteItem }),
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(d.deleteTitle)).toBeInTheDocument();
    expect(
      within(dialog).getByText(d.deleteBody(QUESTIONS[B])),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.deleteAction }),
    );
    await waitFor(() => expect(deleted).toBe(B));
  });

  it("without faq:write: no «Додати», no handles, «Переглянути» opens a read-only dialog", async () => {
    mockReorder();
    await renderGrid({ permissions: [PERM.pagesWrite] });

    expect(
      screen.queryByRole("button", { name: d.add }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(dict.common.viewOnly)).toBeInTheDocument();
    expect(
      within(rowEl(A)).queryByRole("button", {
        name: dict.reorderList.handleLabel(QUESTIONS[A]),
      }),
    ).not.toBeInTheDocument();

    const menu = await openRowMenu(A);
    expect(
      within(menu).queryByRole("menuitem", { name: d.deleteItem }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: dict.common.view }),
    );
    const dialog = await screen.findByRole("dialog", { name: d.editHeading });
    expect(
      within(dialog).queryByRole("button", { name: dict.faqForm.submit }),
    ).not.toBeInTheDocument();
  });
});

describe("AdminFaqTable — deep links keep working", () => {
  it("/faq/new opens the create dialog over the list; closing returns to /faq", async () => {
    mockReorder();
    renderTable({ props: { dialog: { mode: "create" } } });

    const dialog = await screen.findByRole("dialog", {
      name: d.createHeading,
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/faq"));
  });

  it("an unknown id opens nothing and returns to /faq", async () => {
    mockReorder();
    renderTable({ props: { dialog: { mode: "edit", id: "missing-id" } } });

    await waitFor(() => expect(rowIds()).toHaveLength(3));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/faq"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("/faq/[id]/edit opens that item once the list is in", async () => {
    mockReorder();
    renderTable({ props: { dialog: { mode: "edit", id: C } } });

    const dialog = await screen.findByRole("dialog", { name: d.editHeading });
    await waitFor(() =>
      expect(
        within(dialog).getByRole("textbox", { name: dict.faqForm.question }),
      ).toHaveValue(QUESTIONS[C]),
    );
  });
});

describe("AdminFaqTable — views (ЧП1)", () => {
  it("counts «Усі · Показуються · Приховані» from the list", async () => {
    mockReorder();
    await renderGrid();

    expect(view(d.viewAll)).toHaveTextContent("3");
    expect(view(d.viewShown)).toHaveTextContent("2");
    expect(view(d.viewHidden)).toHaveTextContent("1");
  });

  it("writes ?status= when a view is picked", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.click(view(d.viewHidden));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockReplace.mock.calls.at(-1)?.[0]).toContain("status=hidden");
  });

  it("filters locally by ?status= and locks reordering, saying why", async () => {
    mockSearchParams = new URLSearchParams("status=hidden");
    mockReorder();
    renderTable();

    await waitFor(() => expect(rowIds()).toEqual([B]));
    expect(screen.getByText(d.viewLockedHint)).toBeInTheDocument();
    expect(listCalls).toBe(1);

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: " " });
    expect(bodies).toHaveLength(0);
  });
});

describe("AdminFaqTable — ARIA model", () => {
  it("is a `grid` (never a treegrid) whose rows carry aria-rowindex and a roving tabindex", async () => {
    mockReorder();
    await renderGrid();

    expect(screen.queryAllByRole("treegrid")).toHaveLength(0);
    expect(rowEl(A)).toHaveAttribute("aria-rowindex", "2");
    expect(rowEl(C)).toHaveAttribute("aria-rowindex", "4");
    expect(rowEl(A)).not.toHaveAttribute("aria-level");

    expect(screen.getByRole("grid", { name: d.gridLabel })).toHaveAttribute(
      "aria-busy",
      "false",
    );
    expect(rowIds().filter((id) => rowEl(id).tabIndex === 0)).toHaveLength(1);
  });
});

describe("AdminFaqTable — keyboard reorder", () => {
  it("Space ↑ Space sends exactly ONE PATCH with the COMPLETE orderedIds", async () => {
    mockReorder();
    await renderGrid();

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: " " });
    expect(polite()).toBe(
      dict.reorderList.announce.grabbed(QUESTIONS[B], 2, 3),
    );

    fireEvent.keyDown(rowEl(B), { key: "ArrowUp" });
    expect(polite()).toBe(dict.reorderList.announce.moved(QUESTIONS[B], 1, 3));
    expect(rowIds()).toEqual([B, A, C]);
    expect(bodies).toHaveLength(0); // nothing committed yet

    fireEvent.keyDown(rowEl(B), { key: " " });

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ orderedIds: [B, A, C] });
  });

  it("resyncs the list from the PATCH RESPONSE alone — no refetch", async () => {
    mockReorder();
    await renderGrid();
    const before = listCalls;

    keyboardMoveUp(B);

    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() => expect(rowIds()).toEqual([B, A, C]));
    expect(listCalls).toBe(before);
  });

  it("the persistent Undo control sends the INVERSE order", async () => {
    mockReorder();
    await renderGrid();

    keyboardMoveUp(B);
    await waitFor(() => expect(bodies).toHaveLength(1));

    const undo = screen.getByRole("button", { name: dict.reorderList.undo });
    await waitFor(() => expect(undo).toHaveAttribute("aria-disabled", "false"));
    fireEvent.click(undo);

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ orderedIds: DEFAULT_ORDER });
    await waitFor(() =>
      expect(polite()).toBe(dict.reorderList.announce.undone),
    );
  });
});

describe("AdminFaqTable — server rejections", () => {
  it("409 REORDER_STALE → the «list changed» alert, a reload, and the server order back", async () => {
    mockReorder(() =>
      HttpResponse.json(
        { statusCode: 409, error: "REORDER_STALE", message: "stale" },
        { status: 409 },
      ),
    );
    await renderGrid();
    const before = listCalls;

    keyboardMoveUp(B);

    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() =>
      expect(assertive()).toBe(dict.reorderList.rejected.REORDER_STALE),
    );
    await waitFor(() => expect(listCalls).toBeGreaterThan(before));
    expect(rowIds()).toEqual(DEFAULT_ORDER);
  });
});

/**
 * The two rules that keep the payload complete: the list is unpaginated, and
 * anything that hides rows (search, view) LOCKS reordering.
 */
describe("AdminFaqTable — the payload can never be partial", () => {
  it("a search that hides rows LOCKS reordering", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.type(searchBox(), "гарантія");

    await waitFor(() => expect(rowIds()).toEqual([B]));
    expect(
      screen.getByText(dict.reorderList.searchLockedHint),
    ).toBeInTheDocument();
    expect(
      within(rowEl(B)).getByRole("button", {
        name: dict.reorderList.handleLabel(QUESTIONS[B]),
      }),
    ).toHaveAttribute("aria-disabled", "true");

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: " " });
    expect(polite()).toBe(dict.reorderList.announce.searchLocked);
    expect(rowEl(B)).toHaveAttribute("data-grabbed", "false");
    expect(bodies).toHaveLength(0);
  });

  it("searches the answers too", async () => {
    mockReorder();
    await renderGrid();

    expect(searchBox()).toHaveAttribute("placeholder", d.searchPlaceholder);
    await userEvent.type(searchBox(), "14 днів");

    await waitFor(() => expect(rowIds()).toEqual([C]));
  });

  it("never asks for a page, and offers no page controls", async () => {
    const urls: URL[] = [];
    server.use(
      http.get("*/api/admin/faq", ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json(listResponse());
      }),
    );

    renderTable();
    await waitFor(() => expect(rowIds()).toHaveLength(3));
    expect(urls).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() => expect(urls).toHaveLength(2));
    for (const url of urls) {
      expect(url.searchParams.get("page")).toBeNull();
      expect(url.searchParams.get("limit")).toBeNull();
    }
    expect(
      screen.queryByRole("button", { name: dict.common.next }),
    ).not.toBeInTheDocument();
  });

  it("keeps the search local — it never becomes a query parameter", async () => {
    const urls: URL[] = [];
    server.use(
      http.get("*/api/admin/faq", ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json(listResponse());
      }),
    );

    renderTable();
    await waitFor(() => expect(rowIds()).toHaveLength(3));

    await userEvent.type(searchBox(), "гарантія");
    await waitFor(() => expect(rowIds()).toEqual([B]));

    expect(urls).toHaveLength(1);
    expect(urls[0].searchParams.get("search")).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("distinguishes an empty search result from an empty table", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.type(searchBox(), "невідоме");

    expect(
      await screen.findByText(dict.reorderList.emptyMatch("невідоме")),
    ).toBeInTheDocument();
    expect(screen.queryByText(d.empty)).not.toBeInTheDocument();
  });
});
