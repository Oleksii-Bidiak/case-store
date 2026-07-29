/**
 * `AdminBannerTable` — grouped placement sections (TASK-186 / TASK-264-C) and, since
 * TASK-295, one SORTABLE `role="grid"` per placement.
 *
 * The reorder cases are KEYBOARD-ONLY by design: jsdom has no layout, so dnd-kit's
 * collision detection cannot run. Pointer correctness rests on the pointer path
 * sharing ONE `applyMove()` reducer with the keyboard path (pinned by the fixture
 * table in `shared/lib/sortable-tree`).
 *
 * The load-bearing invariant is the SERVER CONTRACT: the payload must name EVERY
 * banner in the placement bucket, so the grid reads the UNFILTERED banner list and
 * a search that hides rows LOCKS reordering rather than PATCHing a partial ordering.
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
import { dict } from "@/shared/config";
import { resetReorderLock } from "@/shared/lib/reorder-lock";
import { AdminBannerTable } from "./admin-banner-table";

// useSearchParams is unavailable under jsdom — mock the URL state. `mockSearchParams`
// is mutable so the TASK-264-C deep-link cases can seed `?placement=`; it resets to
// empty before each test, so the existing "no param" cases render the full view.
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockSearchParams = new URLSearchParams("");
  resetReorderLock();
});

type Placement =
  "HERO_SLIDE" | "PROMO_TILE" | "PROMO_BANNER" | "ANNOUNCEMENT_BAR";
type Status = "DRAFT" | "SCHEDULED" | "PUBLISHED";

function makeBannerRow(
  id: string,
  title: string,
  placement: Placement,
  status: Status,
  sortOrder = 0,
) {
  return {
    id,
    placement,
    title,
    subtitle: null,
    imageUrl: null,
    imageBlurDataUrl: null,
    ctaLabel: null,
    ctaHref: null,
    theme: null,
    sortOrder,
    status,
    publishedAt: status === "PUBLISHED" ? "2026-07-01T00:00:00.000Z" : null,
    scheduledAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

function stubBanners(rows: ReturnType<typeof makeBannerRow>[]) {
  server.use(
    http.get("*/api/admin/banners", () => HttpResponse.json({ data: rows })),
  );
}

describe("AdminBannerTable", () => {
  it("renders banner rows grouped by placement with a section heading", async () => {
    stubBanners([
      makeBannerRow("banner-1", "Summer Hero", "HERO_SLIDE", "PUBLISHED"),
      makeBannerRow("banner-2", "Glass Promo", "PROMO_TILE", "DRAFT"),
    ]);

    renderWithProviders(<AdminBannerTable />);

    await waitFor(() =>
      expect(screen.getByText("Summer Hero")).toBeInTheDocument(),
    );
    expect(screen.getByText("Glass Promo")).toBeInTheDocument();
    expect(
      screen.getByText(dict.banners.placements.HERO_SLIDE),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.banners.placements.PROMO_TILE),
    ).toBeInTheDocument();
  });

  it("shows the published badge for published banners and draft for drafts", async () => {
    stubBanners([
      makeBannerRow("banner-1", "Summer Hero", "HERO_SLIDE", "PUBLISHED"),
      makeBannerRow("banner-2", "Glass Promo", "PROMO_TILE", "DRAFT"),
    ]);

    renderWithProviders(<AdminBannerTable />);

    await waitFor(() =>
      expect(
        screen.getByText(dict.banners.statusLabels.PUBLISHED),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(dict.banners.statusLabels.DRAFT),
    ).toBeInTheDocument();
  });

  it("renders an edit action linking to the banner edit route", async () => {
    stubBanners([
      makeBannerRow("banner-1", "Summer Hero", "HERO_SLIDE", "PUBLISHED"),
    ]);

    renderWithProviders(<AdminBannerTable />);

    const editLink = await screen.findByRole("link", {
      name: dict.common.edit,
    });
    expect(editLink).toHaveAttribute("href", "/banners/banner-1/edit");
  });

  it("shows the empty state when there are no banners", async () => {
    stubBanners([]);

    renderWithProviders(<AdminBannerTable />);

    await waitFor(() =>
      expect(screen.getByText(dict.banners.empty)).toBeInTheDocument(),
    );
  });
});

describe("AdminBannerTable — ?placement= deep link (TASK-264-C)", () => {
  it("renders only the matching section when ?placement= names a real placement", async () => {
    mockSearchParams = new URLSearchParams("placement=HERO_SLIDE");
    stubBanners([
      makeBannerRow("banner-1", "Summer Hero", "HERO_SLIDE", "PUBLISHED"),
      makeBannerRow("banner-2", "Glass Promo", "PROMO_TILE", "DRAFT"),
      makeBannerRow("banner-3", "Top Strip", "ANNOUNCEMENT_BAR", "PUBLISHED"),
    ]);

    renderWithProviders(<AdminBannerTable />);

    // Only the Hero section renders…
    await waitFor(() =>
      expect(
        screen.getByText(dict.banners.placements.HERO_SLIDE),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Summer Hero")).toBeInTheDocument();
    // …the other placements' headings and rows are absent even though the
    // response included banners for them.
    expect(
      screen.queryByText(dict.banners.placements.PROMO_TILE),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(dict.banners.placements.ANNOUNCEMENT_BAR),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Glass Promo")).not.toBeInTheDocument();
    expect(screen.queryByText("Top Strip")).not.toBeInTheDocument();
  });

  it("falls back to the full grouped view for an unrecognized ?placement= value", async () => {
    mockSearchParams = new URLSearchParams("placement=NOT_REAL");
    stubBanners([
      makeBannerRow("banner-1", "Summer Hero", "HERO_SLIDE", "PUBLISHED"),
      makeBannerRow("banner-2", "Glass Promo", "PROMO_TILE", "DRAFT"),
    ]);

    renderWithProviders(<AdminBannerTable />);

    await waitFor(() =>
      expect(
        screen.getByText(dict.banners.placements.HERO_SLIDE),
      ).toBeInTheDocument(),
    );
    // Both sections render — the invalid param is ignored, not rendered empty.
    expect(
      screen.getByText(dict.banners.placements.PROMO_TILE),
    ).toBeInTheDocument();
    expect(screen.getByText("Summer Hero")).toBeInTheDocument();
    expect(screen.getByText("Glass Promo")).toBeInTheDocument();
  });
});

/* ─────────────────── sortable placement grids (TASK-295) ─────────────────── */

const H1 = "11111111-1111-4111-8111-111111111111"; // HERO_SLIDE — Літо
const H2 = "22222222-2222-4222-8222-222222222222"; // HERO_SLIDE — Осінь
const H3 = "33333333-3333-4333-8333-333333333333"; // HERO_SLIDE — Зима
const P1 = "44444444-4444-4444-8444-444444444444"; // PROMO_TILE — Плитка

const TITLES: Record<string, string> = {
  [H1]: "Літо",
  [H2]: "Осінь",
  [H3]: "Зима",
  [P1]: "Плитка",
};

/** Default HERO bucket order. */
const HERO_ORDER = [H1, H2, H3];

function listResponse(heroOrder: string[] = HERO_ORDER) {
  return {
    data: [
      ...heroOrder.map((id, i) =>
        makeBannerRow(id, TITLES[id], "HERO_SLIDE", "PUBLISHED", i),
      ),
      makeBannerRow(P1, TITLES[P1], "PROMO_TILE", "PUBLISHED", 0),
    ],
  };
}

/** Every PATCH body the widget sent, in order. */
let bodies: unknown[] = [];
/** GET count — the "resyncs from the response alone" assertion reads it. */
let listCalls = 0;

/**
 * The reorder endpoint returns the FULL refreshed list (all placements), exactly as
 * the real one does — so a successful PATCH must resync the grid from the response.
 */
function mockReorder(
  respond: () => Response | Promise<Response> = () =>
    HttpResponse.json(listResponse([H2, H1, H3])),
) {
  server.use(
    http.get("*/api/admin/banners", () => {
      listCalls += 1;
      return HttpResponse.json(listResponse());
    }),
    http.patch("*/api/admin/banners/reorder", async ({ request }) => {
      bodies.push(await request.json());
      return respond();
    }),
  );
}

const rowEl = (id: string): HTMLTableRowElement => {
  const el = document.getElementById(`banner-row-${id}`);
  if (!el) throw new Error(`row ${TITLES[id] ?? id} is not rendered`);
  return el as HTMLTableRowElement;
};

const heroGrid = () =>
  screen.getByRole("grid", {
    name: dict.banners.gridLabel(dict.banners.placements.HERO_SLIDE),
  });

const heroIds = (): string[] =>
  Array.from(heroGrid().querySelectorAll<HTMLTableRowElement>("tr[role='row']"))
    .filter((row) => row.id !== "")
    .map((row) => row.id.replace("banner-row-", ""));

const polite = () => screen.getByTestId("tree-live-polite").textContent ?? "";
const assertive = () =>
  screen.getByTestId("tree-live-assertive").textContent ?? "";

async function renderGrids() {
  const result = renderWithProviders(<AdminBannerTable />);
  await screen.findByText(dict.banners.placements.HERO_SLIDE);
  await waitFor(() => expect(heroIds()).toHaveLength(3));
  return result;
}

/** Keyboard: pick up, move up one slot, drop. */
function keyboardMoveUp(id: string) {
  rowEl(id).focus();
  fireEvent.keyDown(rowEl(id), { key: " " });
  fireEvent.keyDown(rowEl(id), { key: "ArrowUp" });
  fireEvent.keyDown(rowEl(id), { key: " " });
}

beforeEach(() => {
  bodies = [];
  listCalls = 0;
});

describe("AdminBannerTable — ARIA model (TASK-295)", () => {
  it("renders ONE grid per placement — `grid`, never `treegrid` — with aria-rowindex rows", async () => {
    mockReorder();
    await renderGrids();

    // A treegrid would announce "level 1" and promise an expansion that a flat
    // list does not have.
    expect(screen.queryAllByRole("treegrid")).toHaveLength(0);
    expect(screen.getAllByRole("grid")).toHaveLength(2);

    // The header is row 1, so the data rows start at 2.
    expect(rowEl(H1)).toHaveAttribute("aria-rowindex", "2");
    expect(rowEl(H2)).toHaveAttribute("aria-rowindex", "3");
    expect(rowEl(H3)).toHaveAttribute("aria-rowindex", "4");
    expect(rowEl(H1)).not.toHaveAttribute("aria-level");
    expect(rowEl(H1)).not.toHaveAttribute("aria-expanded");

    expect(heroGrid()).toHaveAttribute("aria-busy", "false");
    // The roving-tabindex invariant: exactly one row of the grid is tabbable.
    expect(heroIds().filter((id) => rowEl(id).tabIndex === 0)).toHaveLength(1);
  });

  it("has NO sort-order column any more — the row order IS the order", async () => {
    mockReorder();
    await renderGrids();

    expect(screen.queryByText("Порядок")).not.toBeInTheDocument();
  });
});

describe("AdminBannerTable — keyboard reorder (TASK-295)", () => {
  it("Space ↑ Space sends exactly ONE PATCH, carrying the placement and the COMPLETE orderedIds", async () => {
    mockReorder();
    await renderGrids();

    rowEl(H2).focus();
    fireEvent.keyDown(rowEl(H2), { key: " " });
    expect(polite()).toBe(dict.reorderList.announce.grabbed("Осінь", 2, 3));
    expect(rowEl(H2)).toHaveAttribute("data-grabbed", "true");

    fireEvent.keyDown(rowEl(H2), { key: "ArrowUp" });
    expect(polite()).toBe(dict.reorderList.announce.moved("Осінь", 1, 3));
    expect(heroIds()).toEqual([H2, H1, H3]);
    expect(bodies).toHaveLength(0); // nothing committed yet

    fireEvent.keyDown(rowEl(H2), { key: " " });

    await waitFor(() => expect(bodies).toHaveLength(1));
    // EVERY id of the bucket, and the bucket key — a partial list would 409, and a
    // missing placement would reorder the wrong list.
    expect(bodies[0]).toEqual({
      placement: "HERO_SLIDE",
      orderedIds: [H2, H1, H3],
    });
  });

  it("resyncs the list from the PATCH RESPONSE alone — no refetch", async () => {
    mockReorder();
    await renderGrids();
    const before = listCalls;

    keyboardMoveUp(H2);

    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() => expect(heroIds()).toEqual([H2, H1, H3]));
    expect(listCalls).toBe(before);
  });

  it("Escape cancels: the order is restored and ZERO requests are sent", async () => {
    mockReorder();
    await renderGrids();

    rowEl(H3).focus();
    fireEvent.keyDown(rowEl(H3), { key: " " });
    fireEvent.keyDown(rowEl(H3), { key: "ArrowUp" });
    expect(heroIds()).toEqual([H1, H3, H2]);

    fireEvent.keyDown(rowEl(H3), { key: "Escape" });

    expect(heroIds()).toEqual(HERO_ORDER);
    expect(polite()).toBe(dict.reorderList.announce.cancelled("Зима", 3, 3));
    expect(bodies).toHaveLength(0);
  });

  it("the Undo control sends the INVERSE order", async () => {
    mockReorder();
    await renderGrids();

    keyboardMoveUp(H2);
    await waitFor(() => expect(bodies).toHaveLength(1));

    // The HERO section's own Undo control — each placement has one.
    const section = heroGrid().closest("section") as HTMLElement;
    const undo = within(section).getByRole("button", {
      name: dict.reorderList.undo,
    });
    await waitFor(() => expect(undo).toHaveAttribute("aria-disabled", "false"));

    fireEvent.click(undo);

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({
      placement: "HERO_SLIDE",
      orderedIds: HERO_ORDER,
    });
    await waitFor(() =>
      expect(polite()).toBe(dict.reorderList.announce.undone),
    );
  });
});

describe("AdminBannerTable — server rejections (TASK-295)", () => {
  it("409 REORDER_STALE → the «list changed» alert, a reload, and the server order back", async () => {
    mockReorder(() =>
      HttpResponse.json(
        { statusCode: 409, error: "REORDER_STALE", message: "stale" },
        { status: 409 },
      ),
    );
    await renderGrids();
    const before = listCalls;

    keyboardMoveUp(H2);

    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() =>
      expect(assertive()).toBe(dict.reorderList.rejected.REORDER_STALE),
    );
    // Recovery: the list is refetched and the operator's row reads its NEW position.
    await waitFor(() => expect(listCalls).toBeGreaterThan(before));
    await waitFor(() =>
      expect(polite()).toBe(
        dict.reorderList.announce.positionAfterConflict("Осінь", 2, 3),
      ),
    );
    // The optimistic override is dropped — the server order renders.
    expect(heroIds()).toEqual(HERO_ORDER);
  });

  it("an UNKNOWN error code → the never-empty, never-English fallback", async () => {
    mockReorder(() =>
      HttpResponse.json(
        { statusCode: 400, error: "SOMETHING_NEW", message: "?" },
        { status: 400 },
      ),
    );
    await renderGrids();

    keyboardMoveUp(H2);

    await waitFor(() =>
      expect(assertive()).toBe(dict.reorderList.rejectedUnknown("Осінь")),
    );
    await waitFor(() => expect(heroIds()).toEqual(HERO_ORDER));
  });
});

describe("AdminBannerTable — the payload can never be partial (TASK-295)", () => {
  it("a search that hides rows LOCKS reordering", async () => {
    mockReorder();
    await renderGrids();

    await userEvent.type(
      screen.getByRole("searchbox", { name: dict.reorderList.searchLabel }),
      "Літо",
    );

    await waitFor(() => expect(heroIds()).toEqual([H1]));
    expect(
      screen.getByText(dict.reorderList.searchLockedHint),
    ).toBeInTheDocument();

    // The grip is aria-disabled…
    expect(
      within(rowEl(H1)).getByRole("button", {
        name: dict.reorderList.handleLabel("Літо"),
      }),
    ).toHaveAttribute("aria-disabled", "true");

    // …and so is every keyboard move: a payload naming only the visible row would
    // be a partial ordering, which the server rejects as a lost update.
    rowEl(H1).focus();
    fireEvent.keyDown(rowEl(H1), { key: " " });
    expect(polite()).toBe(dict.reorderList.announce.searchLocked);
    expect(rowEl(H1)).toHaveAttribute("data-grabbed", "false");
    expect(bodies).toHaveLength(0);
  });

  it("`?placement=` narrows the SECTIONS, never the query — the moved bucket is still complete", async () => {
    mockSearchParams = new URLSearchParams("placement=HERO_SLIDE");
    mockReorder();
    await renderGrids();

    // Only the deep-linked section renders…
    expect(screen.getAllByRole("grid")).toHaveLength(1);
    expect(
      screen.queryByText(dict.banners.placements.PROMO_TILE),
    ).not.toBeInTheDocument();

    keyboardMoveUp(H3);

    // …and the payload still names EVERY banner of the bucket.
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      placement: "HERO_SLIDE",
      orderedIds: [H1, H3, H2],
    });
  });
});

/**
 * TASK-357 gave every reference table a toolbar with a refresh control — but
 * deliberately did NOT paginate this view. The reorder payload has to name EVERY
 * banner of a placement, and a page is a partial view; paging here would have
 * traded a missing button for a corrupt PATCH.
 */
describe("AdminBannerTable — toolbar (TASK-357)", () => {
  it("refetches on demand without ever asking for a page", async () => {
    const urls: URL[] = [];
    server.use(
      http.get("*/api/admin/banners", ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json({
          data: [
            makeBannerRow("banner-1", "Summer Hero", "HERO_SLIDE", "PUBLISHED"),
          ],
        });
      }),
    );

    renderWithProviders(<AdminBannerTable />);
    await screen.findByText("Summer Hero");
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

  it("keeps the refresh control reachable when the list failed to load", async () => {
    server.use(
      http.get(
        "*/api/admin/banners",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    renderWithProviders(<AdminBannerTable />);

    expect(await screen.findByText(dict.banners.loadError)).toBeInTheDocument();
    // The state where a refresh matters most used to hide the whole toolbar.
    expect(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    ).toBeInTheDocument();
  });
});
