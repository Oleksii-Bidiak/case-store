/**
 * «Головна» — the homepage blocks screen (plan 186, TASK-662).
 *
 * Moves are driven by keyboard and by the «Вище»/«Нижче» buttons: jsdom has no
 * layout, so dnd-kit's collision detection cannot run (the pointer path shares one
 * `applyMove()` reducer with the keyboard, pinned in `shared/lib/sortable-tree`).
 */

import { http, HttpResponse } from "msw";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { resetReorderLock } from "@/shared/lib/reorder-lock";
import { toast } from "@/shared/ui/toast";
import type { HomeBlockEntity } from "@/entities/home-block";
import { HomeBlockList } from "./home-block-list";

jest.mock("@/shared/ui/toast", () => ({
  UNDO_TOAST_DURATION_MS: 10_000,
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    undo: jest.fn(),
    dismiss: jest.fn(),
  },
}));

const d = dict.homeScreen;
const t = dict.homeBlockDialog;

/* ─────────────────────────────── fixtures ──────────────────────────────── */

const HERO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TABS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RAIL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORPHAN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RECENT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const carousel = (id: string, title: string) => ({
  id,
  title,
  source: "MANUAL" as const,
  status: "PUBLISHED" as const,
});

function block(
  id: string,
  sortOrder: number,
  overrides: Partial<HomeBlockEntity> = {},
): HomeBlockEntity {
  return {
    id,
    type: "HERO",
    title: null,
    sortOrder,
    status: "PUBLISHED",
    publishedAt: "2026-10-01T00:00:00.000Z",
    scheduledAt: null,
    carousel: null,
    tabs: [],
    isSystem: true,
    isOrphaned: false,
    isEmpty: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function blocks(): HomeBlockEntity[] {
  return [
    block(HERO, 0),
    block(TABS, 1, {
      type: "TABS",
      title: "Популярне",
      isSystem: false,
      tabs: [
        { sortOrder: 0, carousel: carousel("c-hits", "Хіти продажів") },
        { sortOrder: 1, carousel: carousel("c-new", "Новинки") },
      ],
    }),
    block(RAIL, 2, {
      type: "CAROUSEL",
      isSystem: false,
      carousel: carousel("c-picks", "Редакція обирає"),
    }),
    block(ORPHAN, 3, {
      type: "CAROUSEL",
      isSystem: false,
      isOrphaned: true,
      isEmpty: true,
    }),
    block(RECENT, 4, { type: "RECENTLY_VIEWED", status: "DRAFT" }),
  ];
}

const ALL = [HERO, TABS, RAIL, ORPHAN, RECENT];

const CAROUSELS = [
  { ...carousel("c-picks", "Редакція обирає"), source: "MANUAL" },
  { ...carousel("c-sale", "Знижки до −40%"), source: "ON_SALE" },
  { ...carousel("c-hits", "Хіти продажів"), source: "BESTSELLING" },
].map((c, i) => ({
  ...c,
  categoryId: null,
  itemLimit: 12,
  sortOrder: i,
  publishedAt: null,
  scheduledAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
}));

let patches: unknown[] = [];
let created: unknown[] = [];
let deleted: string[] = [];
let toggled: string[] = [];

function mockApi() {
  server.use(
    http.get("*/api/admin/home-blocks", () =>
      HttpResponse.json({ data: blocks() }),
    ),
    http.patch("*/api/admin/home-blocks/reorder", async ({ request }) => {
      patches.push(await request.json());
      return HttpResponse.json({ data: blocks() });
    }),
    http.patch("*/api/admin/home-blocks/:id/:action", ({ params }) => {
      toggled.push(`${String(params.action)}:${String(params.id)}`);
      const found = blocks().find((b) => b.id === params.id)!;
      return HttpResponse.json({
        data: {
          ...found,
          status: params.action === "publish" ? "PUBLISHED" : "DRAFT",
        },
      });
    }),
    http.delete("*/api/admin/home-blocks/:id", ({ params }) => {
      deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("*/api/admin/home-blocks", async ({ request }) => {
      created.push(await request.json());
      return HttpResponse.json({ data: blocks()[2] }, { status: 201 });
    }),
    http.get("*/api/admin/carousels", () =>
      HttpResponse.json({
        data: CAROUSELS,
        meta: { total: 3, page: 1, limit: 3, totalPages: 1 },
      }),
    ),
  );
}

beforeEach(() => {
  resetReorderLock();
  patches = [];
  created = [];
  deleted = [];
  toggled = [];
  jest.clearAllMocks();
  mockApi();
});

const WRITER = ["home:write", "home:read", "carousels:read"];

async function renderScreen(permissions: string[] = WRITER) {
  const result = renderWithProviders(<HomeBlockList />, {
    auth: { permissions },
  });
  await screen.findByRole("grid", { name: d.gridLabel });
  await waitFor(() => expect(rowIds()).toHaveLength(ALL.length));
  return result;
}

const rowEl = (id: string) => {
  const el = document.getElementById(`home-block-row-${id}`);
  if (!el) throw new Error(`row ${id} is not rendered`);
  return el as HTMLTableRowElement;
};

const rowIds = () =>
  Array.from(
    screen
      .getByRole("grid", { name: d.gridLabel })
      .querySelectorAll<HTMLTableRowElement>("tr[id^='home-block-row-']"),
  ).map((r) => r.id.replace("home-block-row-", ""));

async function openRowMenu(name: string) {
  await userEvent.click(
    await screen.findByRole("button", { name: d.rowActionsAria(name) }),
  );
}

/* ──────────────────────────────── the suite ────────────────────────────── */

describe("HomeBlockList — the list", () => {
  it("draws every block in page order, hidden ones included, with kind and source", async () => {
    await renderScreen();

    expect(rowIds()).toEqual(ALL);
    const hero = rowEl(HERO);
    expect(within(hero).getByText(`· ${d.kind.system}`)).toBeInTheDocument();
    expect(within(hero).getByText(d.summary.hero)).toBeInTheDocument();
    // The tabs as chips, in tab order.
    const tabs = within(rowEl(TABS)).getAllByRole("listitem");
    expect(tabs.map((li) => li.textContent)).toEqual([
      "Хіти продажів",
      "Новинки",
    ]);
    expect(within(rowEl(RECENT)).getByText(d.hidden)).toBeInTheDocument();
  });

  it("highlights a block the site cannot draw, with why and what to do", async () => {
    await renderScreen();

    expect(rowEl(ORPHAN)).toHaveAttribute("data-home-problem", "true");
    expect(within(rowEl(ORPHAN)).getByText(d.warnOrphaned)).toBeInTheDocument();
    expect(rowEl(RAIL)).not.toHaveAttribute("data-home-problem");
  });

  it("has no search or filter over the draggable list", async () => {
    await renderScreen();

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

describe("HomeBlockList — reorder", () => {
  it("a keyboard move PATCHes the FULL order and offers «Скасувати»", async () => {
    await renderScreen();

    const row = rowEl(RECENT);
    act(() => row.focus());
    fireEvent.keyDown(row, { key: " " });
    fireEvent.keyDown(row, { key: "Home" });
    fireEvent.keyDown(row, { key: " " });

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({
      orderedIds: [RECENT, HERO, TABS, RAIL, ORPHAN],
    });
    await waitFor(() => expect(toast.undo).toHaveBeenCalled());
  });

  it("«Нижче» moves one place with the same full payload; the edges are disabled", async () => {
    await renderScreen();

    expect(
      screen.getByRole("button", { name: d.moveUp(dict.homeBlocks.hero) }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: d.moveDown(dict.homeBlocks.recentlyViewed),
      }),
    ).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: d.moveDown(dict.homeBlocks.hero) }),
    );

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({
      orderedIds: [TABS, HERO, RAIL, ORPHAN, RECENT],
    });
  });
});

describe("HomeBlockList — «Показується»", () => {
  it("hiding unpublishes and offers it back; showing publishes", async () => {
    await renderScreen();

    await userEvent.click(
      screen.getByRole("switch", { name: d.toggleAria(dict.homeBlocks.hero) }),
    );
    await waitFor(() => expect(toggled).toEqual([`unpublish:${HERO}`]));
    await waitFor(() =>
      expect(toast.undo).toHaveBeenCalledWith(
        d.toastHidden(dict.homeBlocks.hero),
        expect.objectContaining({ onUndo: expect.any(Function) }),
      ),
    );

    await userEvent.click(
      screen.getByRole("switch", {
        name: d.toggleAria(dict.homeBlocks.recentlyViewed),
      }),
    );
    await waitFor(() =>
      expect(toggled).toEqual([`unpublish:${HERO}`, `publish:${RECENT}`]),
    );
  });
});

describe("HomeBlockList — removing", () => {
  it("a system block has no «Прибрати» at all", async () => {
    await renderScreen();

    await openRowMenu(dict.homeBlocks.hero);
    expect(
      await screen.findByRole("menuitem", { name: d.schedule }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: d.remove }),
    ).not.toBeInTheDocument();
  });

  it("a carousel block is removed after the confirm, which says the carousel stays", async () => {
    await renderScreen();

    await openRowMenu("Редакція обирає");
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.remove }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(d.removeCarousel("Редакція обирає")),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.removeConfirm }),
    );

    await waitFor(() => expect(deleted).toEqual([RAIL]));
  });
});

describe("HomeBlockList — «Додати блок»", () => {
  it("adds a CAROUSEL block live at once, after the last carousel block", async () => {
    await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: d.add }));
    const dialog = await screen.findByRole("dialog", { name: t.addTitle });
    await userEvent.click(
      await within(dialog).findByRole("radio", { name: "Знижки до −40%" }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: t.submitAdd }),
    );

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toEqual({
      type: "CAROUSEL",
      carouselId: "c-sale",
      status: "PUBLISHED",
      // After the orphaned CAROUSEL block (index 3).
      position: 4,
    });
  });

  it("warns — and still allows — the same carousel a second time", async () => {
    await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: d.add }));
    const dialog = await screen.findByRole("dialog", { name: t.addTitle });
    await userEvent.click(
      await within(dialog).findByRole("radio", { name: "Хіти продажів" }),
    );
    expect(
      within(dialog).getByText(
        t.duplicateWarning("Хіти продажів", dict.homeBlocks.asTab("Популярне")),
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: t.submitAdd }),
    );
    await waitFor(() => expect(created).toHaveLength(1));
  });

  it("adds a TABS block as a draft: title + ordered tabs", async () => {
    await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: d.add }));
    const dialog = await screen.findByRole("dialog", { name: t.addTitle });
    await userEvent.click(
      within(dialog).getByRole("radio", { name: t.typeTabs }),
    );
    await userEvent.type(
      within(dialog).getByLabelText(t.titleLabel, { exact: false }),
      "Чорна пʼятниця",
    );
    const pick = await within(dialog).findByLabelText(t.newTabLabel);
    await userEvent.selectOptions(pick, "c-sale");
    await userEvent.click(
      within(dialog).getByRole("button", { name: t.addTab }),
    );
    await userEvent.selectOptions(
      within(dialog).getByLabelText(t.newTabLabel),
      "c-picks",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: t.addTab }),
    );
    // Reorder the tabs inside the dialog.
    await userEvent.click(
      within(dialog).getByRole("button", { name: t.tabUp("Редакція обирає") }),
    );
    await userEvent.click(
      within(dialog).getByRole("radio", { name: t.showDraft }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: t.submitAdd }),
    );

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toEqual({
      type: "TABS",
      title: "Чорна пʼятниця",
      tabs: ["c-picks", "c-sale"],
      status: "DRAFT",
      position: 4,
    });
  });

  it("refuses to send a CAROUSEL block without a carousel", async () => {
    await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: d.add }));
    const dialog = await screen.findByRole("dialog", { name: t.addTitle });
    await within(dialog).findByRole("radio", { name: "Знижки до −40%" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: t.submitAdd }),
    );

    expect(
      await within(dialog).findByText(t.errors.carouselRequired),
    ).toBeInTheDocument();
    expect(created).toEqual([]);
  });
});

describe("HomeBlockList — read-only (home:read only)", () => {
  it("shows the same list without a single control that changes it", async () => {
    await renderScreen(["home:read"]);

    expect(
      screen.getByText(dict.readOnlyView.notices.home),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: d.add }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: dict.reorderList.handleLabel(dict.homeBlocks.hero),
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: d.rowActionsAria(dict.homeBlocks.hero),
      }),
    ).not.toBeInTheDocument();
    // The state in words instead of the switch.
    expect(within(rowEl(HERO)).getByText(d.shown)).toBeInTheDocument();

    // And a keyboard «move» does nothing.
    const row = rowEl(RECENT);
    act(() => row.focus());
    fireEvent.keyDown(row, { key: " " });
    fireEvent.keyDown(row, { key: "ArrowUp" });
    fireEvent.keyDown(row, { key: " " });
    expect(patches).toEqual([]);
  });
});
