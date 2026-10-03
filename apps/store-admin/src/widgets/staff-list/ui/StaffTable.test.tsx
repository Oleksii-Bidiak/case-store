import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict } from "@/shared/config";
import { StaffTable } from "./StaffTable";

const d = dict.staff;
const r = dict.common.registry;

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSearchParamsRef = { current: new URLSearchParams("") };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => "/staff",
  useSearchParams: () => mockSearchParamsRef.current,
}));

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "manager-1",
    email: "manager@example.com",
    firstName: "Олена",
    lastName: "Коваль",
    phone: null,
    role: "MANAGER",
    isOwner: false,
    level: 1,
    isActive: true,
    permissionCount: 4,
    lastSeenAt: "2026-09-10T08:00:00.000Z",
    emailVerifiedAt: null,
    lockedUntil: null,
    failedLoginAttempts: 0,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

/**
 * Answers like the API does for the two questions the screen asks: the page
 * itself, and «how many of them are active» (`isActive=true&limit=1`, read off
 * `meta.total`). `total` lets a test say "there are more than this page".
 */
function stubStaff(
  rows: Array<Record<string, unknown>>,
  { total }: { total?: number } = {},
) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get("*/api/admin/staff", ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      const isActive = params.get("isActive");
      const matching =
        isActive === null
          ? rows
          : rows.filter((row) => String(row.isActive ?? true) === isActive);
      return HttpResponse.json({
        data: matching,
        meta: {
          total: isActive === null ? (total ?? rows.length) : matching.length,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      });
    }),
  );
  return requests;
}

function setViewport(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: mobile,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function renderTable() {
  return renderWithProviders(
    <WithAuth isOwner>
      <StaffTable />
    </WithAuth>,
  );
}

const originalMatchMedia = window.matchMedia;

describe("StaffTable", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
    localStorage.clear();
    setViewport(false);
  });

  afterAll(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("labels each row with its level in words, not its role", async () => {
    stubStaff([
      makeRow(),
      makeRow({
        id: "owner-1",
        email: "owner@example.com",
        firstName: "Олексій",
        lastName: null,
        role: "ADMIN",
        isOwner: true,
        level: 3,
        permissionCount: 0,
      }),
    ]);
    renderTable();

    expect(await screen.findByText(d.levelManager)).toBeInTheDocument();
    // «Власник» rather than «Адміністратор»: the level is server truth and the
    // owner and a deputy share a role.
    expect(screen.getByText(d.levelOwner)).toBeInTheDocument();
  });

  /**
   * Badge canon (Д-ж2): only the owner stands out. A deputy used to wear the
   * `warning` colour, which read as "something is wrong with this account".
   */
  it("draws the level badge by the canon — owner filled, admin neutral outline, manager secondary", async () => {
    stubStaff([
      makeRow(),
      makeRow({
        id: "owner-1",
        email: "owner@example.com",
        role: "ADMIN",
        isOwner: true,
        level: 3,
        permissionCount: 0,
      }),
      makeRow({
        id: "deputy-1",
        email: "deputy@example.com",
        role: "ADMIN",
        level: 2,
        permissionCount: 0,
      }),
    ]);
    renderTable();

    expect(await screen.findByText(d.levelAdmin)).toHaveAttribute(
      "data-variant",
      "outline",
    );
    expect(screen.getByText(d.levelOwner)).toHaveAttribute(
      "data-variant",
      "default",
    );
    expect(screen.getByText(d.levelManager)).toHaveAttribute(
      "data-variant",
      "secondary",
    );
  });

  it("says «Вимкнено» on a grey badge for a switched-off account, «Активний» otherwise", async () => {
    stubStaff([
      makeRow(),
      makeRow({ id: "off-1", email: "off@example.com", isActive: false }),
    ]);
    renderTable();

    expect(await screen.findByText(d.statusOff)).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(screen.getByText(dict.common.active)).toHaveAttribute(
      "data-variant",
      "default",
    );
    expect(screen.queryByText(dict.common.inactive)).not.toBeInTheDocument();
  });

  /**
   * An administrator's `permissionCount` is 0 and always will be — they pass
   * every guard by level and hold no rows. Printing «0» in the «Права» column
   * would be the list-shaped version of the empty grid the card refuses to show.
   */
  it("prints «Повний доступ» instead of 0 for an account that holds everything by level", async () => {
    stubStaff([
      makeRow({
        id: "deputy-1",
        email: "deputy@example.com",
        role: "ADMIN",
        level: 2,
        permissionCount: 0,
      }),
    ]);
    renderTable();

    expect(
      await screen.findByText(d.permissionsFullAccess),
    ).toBeInTheDocument();
  });

  it("counts a manager's permissions with the agreeing noun — «4 права»", async () => {
    stubStaff([makeRow({ permissionCount: 4 })]);
    renderTable();

    expect(await screen.findByText(d.permissionsColumn(4))).toBeInTheDocument();
    expect(d.permissionsColumn(4)).toBe("4 права");
    expect(d.permissionsColumn(8)).toBe("8 прав");
  });

  it("names the column «Останній вхід» and says «ще не входив» rather than printing an empty cell", async () => {
    stubStaff([makeRow({ lastSeenAt: null })]);
    renderTable();

    expect(await screen.findByText(d.lastSeenNever)).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /Останній вхід/ }),
    ).toBeInTheDocument();
  });

  /**
   * `AdminUserTable` explains why accounts have no bulk select. Here the reason
   * is sharper: this list is ONLY the people who can enter the panel, so one
   * mis-clicked bulk deactivate is the shop with nobody able to sign in — and the
   * server's guard is per-target, so such a call would half-succeed.
   */
  it("offers no row selection", async () => {
    stubStaff([makeRow()]);
    renderTable();

    await screen.findByText("Олена Коваль");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("offers the hiring CTA from the empty state, where the answer is obvious", async () => {
    stubStaff([]);
    renderTable();

    expect(await screen.findByText(d.emptyAll)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: d.create })).toBeInTheDocument();
  });

  describe("opening a person — «Переглянути» moved to the row and «⋯»", () => {
    it("links the name to the card, so the row opens it (and middle-click opens a tab)", async () => {
      stubStaff([makeRow()]);
      renderTable();

      const name = await screen.findByText("Олена Коваль");
      expect(name.closest("a")).toHaveAttribute("href", "/staff/manager-1");
    });

    it("offers «Відкрити» in the row's «⋯» menu", async () => {
      stubStaff([makeRow()]);
      renderTable();

      await userEvent.click(
        await screen.findByRole("button", {
          name: r.rowActionsAria("Олена Коваль"),
        }),
      );

      expect(
        await screen.findByRole("menuitem", { name: d.rowOpen }),
      ).toHaveAttribute("href", "/staff/manager-1");
    });
  });

  describe("toolbar — search, «Фільтри», «Колонки», «Вид», refresh in one row", () => {
    it("has the search named by its fields, and the four controls", async () => {
      stubStaff([makeRow()]);
      renderTable();

      await screen.findByText("Олена Коваль");
      expect(
        screen.getByRole("searchbox", { name: d.searchAria }),
      ).toHaveAttribute("placeholder", d.searchPlaceholder);
      expect(
        screen.getByRole("button", { name: r.filters }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: r.columns }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: r.view(d.viewDefault) }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: dict.common.table.refreshAria }),
      ).toBeInTheDocument();
    });

    /**
     * The two selects «Усі рівні» / «Усі статуси» moved into the sheet — nothing
     * is lost, it is one click further and no longer crowds the search.
     */
    it("applies the level and status filters from the sheet into the URL", async () => {
      stubStaff([makeRow()]);
      renderTable();
      await screen.findByText("Олена Коваль");

      await userEvent.click(screen.getByRole("button", { name: r.filters }));
      const sheet = await screen.findByRole("dialog");

      await userEvent.click(
        within(
          within(sheet).getByRole("group", { name: d.filterLevelAria }),
        ).getByRole("button", { name: d.levelManager }),
      );
      await userEvent.click(
        within(
          within(sheet).getByRole("group", { name: d.filterStatusAria }),
        ).getByRole("button", { name: d.filterInactive }),
      );
      await userEvent.click(
        within(sheet).getByRole("button", { name: d.filtersApply }),
      );

      expect(mockReplace).toHaveBeenLastCalledWith(
        "/staff?role=MANAGER&isActive=false",
      );
    });

    it("shows an applied filter as a chip, and removing the chip drops it from the URL", async () => {
      mockSearchParamsRef.current = new URLSearchParams(
        "role=ADMIN&isActive=true",
      );
      stubStaff([makeRow({ role: "ADMIN", level: 2 })]);
      renderTable();

      const levelChip = await screen.findByRole("button", {
        name: r.removeChipAria(d.chipLevel(d.levelAdmin)),
      });
      expect(
        screen.getByRole("button", {
          name: r.removeChipAria(d.chipStatus(d.filterActive)),
        }),
      ).toBeInTheDocument();
      // The «Фільтри» button counts what is applied.
      expect(
        screen.getByRole("button", {
          // «Фільтри» + the sr-only «, застосовано: 2» (the digit badge is
          // aria-hidden).
          name: new RegExp(`^${r.filters}\\s*${r.filtersApplied(2)}$`),
        }),
      ).toBeInTheDocument();

      await userEvent.click(levelChip);
      expect(mockReplace).toHaveBeenLastCalledWith("/staff?isActive=true");
    });

    it("sends the filters from the URL to the API", async () => {
      mockSearchParamsRef.current = new URLSearchParams(
        "role=MANAGER&isActive=false&search=olena",
      );
      const requests = stubStaff([makeRow({ isActive: false })]);
      renderTable();
      await screen.findByText("Олена Коваль");

      const page = requests.find((params) => params.get("limit") !== "1");
      expect(page?.get("role")).toBe("MANAGER");
      expect(page?.get("isActive")).toBe("false");
      expect(page?.get("search")).toBe("olena");
    });
  });

  describe("summary line", () => {
    /**
     * «Знайдено 5 співробітників · активних 3». The total is `meta.total`, not
     * the rows on this page, and «активних» is the API's own count for the same
     * search and level — never a number derived from one page.
     */
    it("reports the API's total and the active count for the same filters", async () => {
      stubStaff(
        [
          makeRow(),
          makeRow({ id: "m-2", email: "m2@example.com" }),
          makeRow({ id: "m-3", email: "m3@example.com", isActive: false }),
        ],
        { total: 3 },
      );
      renderTable();

      const summary = await screen.findByText(d.summaryFound, {
        exact: false,
      });
      await waitFor(() =>
        expect(summary.textContent).toBe(
          `${d.summaryFound} 3 співробітники · ${d.summaryActive} 2`,
        ),
      );
    });

    it("names the sort the list is in", async () => {
      stubStaff([makeRow()]);
      renderTable();

      expect(
        await screen.findByText(r.summarySort(d.sortCreatedDesc), {
          exact: false,
        }),
      ).toBeInTheDocument();
    });

    it("sorts by the person column — the one field the API sorts besides creation date", async () => {
      stubStaff([makeRow()]);
      renderTable();
      await screen.findByText("Олена Коваль");

      await userEvent.click(
        screen.getByRole("button", { name: new RegExp(d.colPerson) }),
      );
      expect(mockReplace).toHaveBeenLastCalledWith(
        "/staff?sortBy=email&sortOrder=desc",
      );
      // Level, permissions and last sign-in are not sortable server-side, so
      // they are not drawn as sort buttons.
      expect(
        screen.queryByRole("button", { name: new RegExp(d.colLastSeen) }),
      ).not.toBeInTheDocument();
    });
  });

  it("shows a card per person below md, with the level, rights and last sign-in", async () => {
    setViewport(true);
    stubStaff([makeRow({ lastSeenAt: null })]);
    renderTable();

    const card = await screen.findByRole("listitem", { name: "Олена Коваль" });
    expect(within(card).getByText(d.levelManager)).toBeInTheDocument();
    expect(within(card).getByText(d.permissionsColumn(4))).toBeInTheDocument();
    expect(
      within(card).getByText(d.cardLastSeen(d.lastSeenNever)),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("button", {
        name: r.rowActionsAria("Олена Коваль"),
      }),
    ).toBeInTheDocument();
  });
});
