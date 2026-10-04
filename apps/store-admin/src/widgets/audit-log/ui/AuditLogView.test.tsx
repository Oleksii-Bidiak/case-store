import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import {
  fromKyivDateEnd,
  fromKyivDateStart,
  toKyivDateInput,
} from "@/shared/lib";
import { AuditLogView } from "./AuditLogView";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSearchParamsRef = { current: new URLSearchParams("") };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => "/audit-log",
  useSearchParams: () => mockSearchParamsRef.current,
}));

// TASK-430: the «Мої дії» filter needs the viewer's own id, so the view reads
// the auth context. This widget renders without an <AuthProvider>.
const VIEWER_ID = "owner-uuid-1";
jest.mock("@/entities/session", () => ({
  useAuth: () => ({
    userId: "owner-uuid-1",
    role: "ADMIN",
    email: "owner@example.com",
    accessToken: null,
    isAuthenticated: true,
    isStaff: true,
    isOwner: true,
    isInitializing: false,
    permissions: [],
    arePermissionsLoading: false,
    can: () => true,
    canAll: () => true,
    setTokens: jest.fn(),
    clearTokens: jest.fn(),
  }),
}));

const d = dict.auditLog;
const r = dict.common.registry;

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

const originalMatchMedia = window.matchMedia;
afterAll(() => {
  window.matchMedia = originalMatchMedia;
});

const PRODUCT_ID = "0b9d2f4e-0000-4000-8000-000000000001";

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "log-1",
    actorId: "user-1",
    actorEmail: "manager@example.com",
    actorRole: "MANAGER",
    action: "product.update",
    entityType: "product",
    entityId: PRODUCT_ID,
    summary: `PUT /api/admin/products/${PRODUCT_ID}`,
    diff: null,
    ip: null,
    userAgent: null,
    createdAt: "2026-07-29T10:00:00.000Z",
    ...overrides,
  };
}

/**
 * Stub the log and record every request — the sort assertions care about what
 * reached the API, not only about what the URL says.
 */
function stubLog(rows = [makeEntry()], total = rows.length) {
  const state = { calls: 0, params: [] as URLSearchParams[] };
  server.use(
    http.get("*/api/admin/audit-log", ({ request }) => {
      state.calls += 1;
      state.params.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        data: rows,
        meta: { total, page: 1, limit: 20, totalPages: 1 },
      });
    }),
  );
  return state;
}

/** The last request for the PAGE (the sheet's count probe asks with limit=1). */
const lastParams = (state: ReturnType<typeof stubLog>) =>
  [...state.params]
    .reverse()
    .find((p) => p.get("limit") !== "1") as URLSearchParams;

function makeStaff(overrides: Record<string, unknown> = {}) {
  return {
    id: "staff-olena",
    email: "olena@example.com",
    firstName: "Олена",
    lastName: "Коваль",
    phone: null,
    role: "MANAGER",
    isOwner: false,
    level: 1,
    isActive: true,
    permissionCount: 3,
    lastSeenAt: null,
    emailVerifiedAt: null,
    lockedUntil: null,
    failedLoginAttempts: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

/** The staff register behind the actor filter and the «Хто» names (TASK-843). */
function stubStaff(rows: Array<Record<string, unknown>>) {
  const state = { params: [] as URLSearchParams[] };
  server.use(
    http.get("*/api/admin/staff", ({ request }) => {
      state.params.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        data: rows,
        meta: { total: rows.length, page: 1, limit: 100, totalPages: 1 },
      });
    }),
  );
  return state;
}

const OWNER = makeStaff({
  id: VIEWER_ID,
  email: "owner@example.com",
  firstName: "Олександр",
  lastName: "Коваленко",
  role: "ADMIN",
  isOwner: true,
  level: 3,
});

beforeEach(() => {
  mockReplace.mockClear();
  mockPush.mockClear();
  mockSearchParamsRef.current = new URLSearchParams("");
  localStorage.clear();
  setViewport(false);
  // The viewer themself comes back from the register too — the view must not
  // offer them twice.
  stubStaff([
    OWNER,
    makeStaff(),
    makeStaff({
      id: "staff-ihor",
      email: "ihor@example.com",
      firstName: null,
      lastName: null,
      isActive: false,
    }),
  ]);
});

async function openFilters() {
  await userEvent.click(
    screen.getByRole("button", { name: new RegExp(`^${r.filters}`) }),
  );
  return screen.findByRole("dialog");
}

async function applyFilters(sheet: HTMLElement) {
  await userEvent.click(
    within(sheet).getByRole("button", { name: /^Показати/ }),
  );
}

/* ── Rows: a sentence, who, and the details ─────────────────────────────── */

describe("AuditLogView — an entry as a sentence (Ж1, TASK-1068)", () => {
  it("says what was done and with what, linking to the object", async () => {
    stubLog([
      makeEntry({
        action: "order.updateStatus",
        entityType: "order",
        entityId: "7c1e4b2a-0000-4000-8000-000000000009",
        diff: { status: { to: "SHIPPED" } },
      }),
    ]);
    renderWithProviders(<AuditLogView />);

    expect(await screen.findByText("Змінено статус")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "замовлення #7C1E4B2A" });
    expect(link).toHaveAttribute(
      "href",
      "/orders/7c1e4b2a-0000-4000-8000-000000000009",
    );
    // What changed, in words: the order status label, not SHIPPED.
    expect(screen.getByText(/Статус → Відправлено/)).toBeInTheDocument();
  });

  it("does not link an object the panel has no page for", async () => {
    stubLog([
      makeEntry({
        action: "seoSettings.uploadLogo",
        entityType: "seoSettings",
        entityId: null,
      }),
    ]);
    renderWithProviders(<AuditLogView />);

    expect(await screen.findByText("Завантажено логотип")).toBeInTheDocument();
    expect(screen.getByText(d.entityNouns.seoSettings)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /SEO/ })).not.toBeInTheDocument();
  });

  it("falls back to the raw key for an action it cannot name", async () => {
    // A new guarded route appears in the log before anyone adds its label. The
    // row must degrade to what the column showed before labels existed — never
    // vanish and never claim «Невідома дія».
    stubLog([
      makeEntry({ action: "warehouse.rebalance", entityType: "warehouse" }),
    ]);
    renderWithProviders(<AuditLogView />);

    expect(await screen.findByText("warehouse.rebalance")).toBeInTheDocument();
  });

  it("names the actor from the staff register, with a level badge — the owner is «Власник»", async () => {
    stubLog([
      makeEntry({
        id: "a",
        actorId: VIEWER_ID,
        actorEmail: "owner@example.com",
        actorRole: "ADMIN",
      }),
      makeEntry({
        id: "b",
        actorId: "staff-olena",
        actorEmail: "olena@example.com",
      }),
    ]);
    renderWithProviders(<AuditLogView />);

    expect(await screen.findByText("Олександр Коваленко")).toBeInTheDocument();
    expect(screen.getByText(dict.staff.levelOwner)).toBeInTheDocument();
    expect(screen.getByText("Олена Коваль")).toBeInTheDocument();
    expect(screen.getByText(dict.staff.levelManager)).toBeInTheDocument();
  });

  it("falls back to the email the log kept, and says when the account is gone", async () => {
    stubLog([
      makeEntry({ id: "a" }),
      makeEntry({ id: "b", actorId: null, actorEmail: "gone@example.com" }),
      makeEntry({ id: "c", actorId: null, actorEmail: null, actorRole: null }),
    ]);
    renderWithProviders(<AuditLogView />);

    expect(await screen.findByText("manager@example.com")).toBeInTheDocument();
    expect(
      screen.getByText(d.deletedActor("gone@example.com")),
    ).toBeInTheDocument();
    expect(screen.getByText(d.systemActor)).toBeInTheDocument();
  });

  it("groups the entries by day when the log is sorted by time", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    stubLog([
      makeEntry({ id: "a", createdAt: new Date(now - 60_000).toISOString() }),
      makeEntry({ id: "b", createdAt: new Date(now - day).toISOString() }),
      makeEntry({ id: "c", createdAt: "2026-01-05T10:00:00.000Z" }),
    ]);
    renderWithProviders(<AuditLogView />);
    await screen.findAllByText("manager@example.com");

    const heads = screen
      .getAllByRole("columnheader")
      .filter((th) => th.getAttribute("scope") === "colgroup")
      .map((th) => th.textContent);
    expect(heads).toHaveLength(3);
    expect(heads[0]).toMatch(/^Сьогодні, /);
    expect(heads[1]).toMatch(/^Вчора, /);
    expect(heads[2]).toBe("05.01.2026");
  });

  it("does not group when sorted by something else", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "sortBy=action&sortOrder=asc",
    );
    stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(
      screen
        .getAllByRole("columnheader")
        .filter((th) => th.getAttribute("scope") === "colgroup"),
    ).toHaveLength(0);
  });
});

describe("AuditLogView — the opened entry (Ж2)", () => {
  it("shows «Поле · Було · Стало» in words and the technical details with the raw key", async () => {
    const user = userEvent.setup();
    stubLog([
      makeEntry({
        diff: {
          price: { from: "1599.00", to: "1299.00" },
          isActive: { to: false },
        },
      }),
    ]);
    renderWithProviders(<AuditLogView />);

    await user.click(await screen.findByRole("button", { name: /^Деталі: / }));

    const table = screen.getByRole("table", { name: d.diffCaption });
    const rows = within(table).getAllByRole("row");
    expect(rows[0]).toHaveTextContent(`${d.diffField}${d.diffFrom}${d.diffTo}`);
    expect(rows[1]).toHaveTextContent(d.fieldLabels.price);
    expect(rows[1].textContent).toMatch(/1\s?599\s?₴/);
    expect(rows[1].textContent).toMatch(/1\s?299\s?₴/);
    expect(rows[2]).toHaveTextContent(d.fieldLabels.isActive);
    expect(rows[2]).toHaveTextContent(d.valueNo);

    // The search box matches `action` EXACTLY on the server, so the key stays
    // one click away — in the technical details.
    expect(screen.getByText(d.technicalDetails)).toBeInTheDocument();
    expect(screen.getByText("product.update")).toBeInTheDocument();
    expect(
      screen.getByText(`PUT /api/admin/products/${PRODUCT_ID}`),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: d.copyIdAria("#0B9D2F4E") }),
    ).toBeInTheDocument();
  });

  it("opens on a click anywhere on the row — and navigates nowhere", async () => {
    const user = userEvent.setup();
    stubLog([makeEntry({ diff: { name: { to: "Чохол" } } })]);
    renderWithProviders(<AuditLogView />);

    await user.click(await screen.findByText("manager@example.com"));
    expect(
      screen.getByRole("table", { name: d.diffCaption }),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

/* ── Sorting ────────────────────────────────────────────────────────────── */

/**
 * TASK-356 — sorting was added to `AuditLogQueryDto` for exactly three fields.
 * The object column stays unsorted: its cell is a type/id pair.
 */
describe("AuditLogView — sorting", () => {
  it("offers sortable «Коли», «Хто» and «Що зроблено» — and none on «Об'єкт»", async () => {
    stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    for (const label of [d.colWhen, d.colWho, d.colAction]) {
      expect(
        screen.getByRole("button", { name: dict.common.sortByAria(label) }),
      ).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", {
        name: dict.common.sortByAria(d.colEntity),
      }),
    ).not.toBeInTheDocument();
  });

  it("writes sortBy=actorEmail into the URL on the «Хто» header click", async () => {
    stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.sortByAria(d.colWho) }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("sortBy=actorEmail"),
    );
  });

  it("forwards the URL's sort to the API and names it in the summary", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "sortBy=action&sortOrder=asc",
    );
    const state = stubLog([makeEntry()], 64);
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(lastParams(state).get("sortBy")).toBe("action");
    expect(lastParams(state).get("sortOrder")).toBe("asc");
    expect(screen.getByText(d.summaryFound, { exact: false }).textContent).toBe(
      `${d.summaryFound} 64 записи`,
    );
    expect(
      screen.getByText(r.summarySort(d.sortActionAsc), { exact: false }),
    ).toBeInTheDocument();
  });
});

/* ── Filters ────────────────────────────────────────────────────────────── */

/**
 * TASK-356 moved filters and page off `useState` and into the query string —
 * this screen is opened to show someone what happened.
 */
describe("AuditLogView — URL-driven filters", () => {
  it("seeds the search and the chips from the URL so a reload keeps the view", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "action=order.updateStatus&entityType=order",
    );
    const state = stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(screen.getByLabelText(d.filterActionAria)).toHaveValue(
      "order.updateStatus",
    );
    expect(
      screen.getByRole("button", {
        name: r.removeChipAria(d.chipEntity(d.entityLabels.order)),
      }),
    ).toBeInTheDocument();
    expect(lastParams(state).get("action")).toBe("order.updateStatus");
    expect(lastParams(state).get("entityType")).toBe("order");
  });

  it("pushes the debounced action filter into the URL", async () => {
    stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    await userEvent.type(
      screen.getByLabelText(d.filterActionAria),
      "order.updateStatus",
    );

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("action=order.updateStatus"),
      ),
    );
  });

  /**
   * TASK-423. `AuditRepository` matches `entityType` EXACTLY, so the type is
   * offered as a choice, spelled the way the server stores it.
   */
  it("offers «Що змінювали» as a CHOICE, writing the wire value", async () => {
    stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    const sheet = await openFilters();
    await userEvent.click(
      within(
        within(sheet).getByRole("group", { name: d.filterEntityAria }),
      ).getByRole("button", { name: d.entityLabels.product }),
    );
    await applyFilters(sheet);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("entityType=product"),
      ),
    );
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent(d.entityLabels.product)),
    );
  });

  it("clears the entity filter from its chip", async () => {
    mockSearchParamsRef.current = new URLSearchParams("entityType=product");
    stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    await userEvent.click(
      screen.getByRole("button", {
        name: r.removeChipAria(d.chipEntity(d.entityLabels.product)),
      }),
    );

    expect(mockReplace).toHaveBeenCalledWith("/audit-log");
  });

  /**
   * The list of entity types is a hand-kept mirror of a server-side rule, so it
   * can fall behind a new module. The value still filters and is clearable.
   */
  it("still names and clears an entity type it does not know about", async () => {
    mockSearchParamsRef.current = new URLSearchParams("entityType=warehouse");
    const state = stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(lastParams(state).get("entityType")).toBe("warehouse");
    expect(
      screen.getByRole("button", {
        name: r.removeChipAria(d.chipEntity("warehouse")),
      }),
    ).toBeInTheDocument();
  });

  it("filters by a period — Kyiv days sent as instants (from/to)", async () => {
    const state = stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    const sheet = await openFilters();
    await userEvent.click(
      within(sheet).getByRole("button", { name: d.period7Days }),
    );
    await applyFilters(sheet);

    const url = decodeURIComponent(mockReplace.mock.calls.at(-1)?.[0] ?? "");
    const today = toKyivDateInput(Date.now());
    expect(url).toContain(`to=${today}`);
    expect(url).toMatch(/from=\d{4}-\d{2}-\d{2}/);

    mockSearchParamsRef.current = new URLSearchParams(
      `from=2026-09-23&to=2026-09-25`,
    );
    const after = stubLog();
    renderWithProviders(<AuditLogView />);
    await waitFor(() => expect(after.params.length).toBeGreaterThan(0));
    expect(lastParams(after).get("from")).toBe(
      fromKyivDateStart("2026-09-23")?.toISOString(),
    );
    expect(lastParams(after).get("to")).toBe(
      fromKyivDateEnd("2026-09-25")?.toISOString(),
    );
    expect(state.calls).toBeGreaterThan(0);
  });

  it("names the period chip like the artboard", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "from=2026-09-23&to=2026-09-25",
    );
    stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(
      screen.getByRole("button", {
        name: r.removeChipAria(d.chipPeriod("23.09 – 25.09.2026")),
      }),
    ).toBeInTheDocument();
  });
});

/**
 * TASK-423 — the log used to page at 50 with no control anywhere.
 */
describe("AuditLogView — page size", () => {
  it("asks for the shared default of 20 and offers the rows-per-page control", async () => {
    const state = stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(lastParams(state).get("limit")).toBe("20");
    expect(
      screen.getByRole("combobox", { name: dict.common.table.pageSizeLabel }),
    ).toBeInTheDocument();
  });

  it("forwards a chosen page size to the API", async () => {
    mockSearchParamsRef.current = new URLSearchParams("limit=100");
    const state = stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(lastParams(state).get("limit")).toBe("100");
  });
});

/**
 * TASK-430 / TASK-843 — «мої дії», a colleague by name, and the role axis.
 */
describe("AuditLogView — actor filters", () => {
  it("offers «Мої дії» and sends the viewer's own id", async () => {
    stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    const sheet = await openFilters();
    await userEvent.click(
      within(sheet).getByRole("button", { name: d.filterActorMine }),
    );
    await applyFilters(sheet);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining(`actorId=${VIEWER_ID}`),
      ),
    );
  });

  it("forwards actorRole to the API and names the chip in Ukrainian", async () => {
    mockSearchParamsRef.current = new URLSearchParams("actorRole=MANAGER");
    const state = stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(lastParams(state).get("actorRole")).toBe("MANAGER");
    expect(
      screen.getByRole("button", {
        name: r.removeChipAria(d.chipLevel(dict.users.roleManager)),
      }),
    ).toBeInTheDocument();
  });

  it("names «Мої дії» from the URL rather than a raw uuid", async () => {
    mockSearchParamsRef.current = new URLSearchParams(`actorId=${VIEWER_ID}`);
    stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(
      screen.getByRole("button", {
        name: r.removeChipAria(d.chipActor(d.filterActorMine)),
      }),
    ).toBeInTheDocument();
  });

  it("names and clears a COLLEAGUE's id arriving from a shared link", async () => {
    mockSearchParamsRef.current = new URLSearchParams("actorId=other-uuid-2");
    const state = stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(lastParams(state).get("actorId")).toBe("other-uuid-2");
    const chip = screen.getByRole("button", {
      name: r.removeChipAria(d.chipActor(d.filterActorOther("other-uuid-2"))),
    });
    await userEvent.click(chip);
    expect(mockReplace).toHaveBeenCalledWith("/audit-log");
  });

  it("offers every colleague by name — deactivated ones too — with a search (TASK-843)", async () => {
    const staff = stubStaff([
      OWNER,
      makeStaff(),
      makeStaff({
        id: "staff-ihor",
        email: "ihor@example.com",
        firstName: null,
        lastName: null,
        isActive: false,
      }),
    ]);
    stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    const sheet = await openFilters();
    const group = within(sheet).getByRole("group", {
      name: d.filterActorAria,
    });
    const options = within(group)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(options).toEqual([
      d.filterActorAll,
      d.filterActorMine,
      "Олена Коваль",
      "ihor@example.com",
    ]);
    // The viewer is not offered a second time under their own name.
    expect(options).not.toContain("Олександр Коваленко");
    expect(staff.params[0]?.get("limit")).toBe("100");

    await userEvent.type(
      within(sheet).getByRole("searchbox", { name: d.filterActorSearchAria }),
      "оле",
    );
    expect(
      within(group)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([d.filterActorAll, d.filterActorMine, "Олена Коваль"]);

    await userEvent.click(
      within(group).getByRole("button", { name: "Олена Коваль" }),
    );
    await applyFilters(sheet);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("actorId=staff-olena"),
      ),
    );
  });

  it("names a colleague's id from a shared link by the staff register", async () => {
    mockSearchParamsRef.current = new URLSearchParams("actorId=staff-olena");
    stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(
      await screen.findByRole("button", {
        name: r.removeChipAria(d.chipActor("Олена Коваль")),
      }),
    ).toBeInTheDocument();
  });

  it("keeps «Мої дії» and a readable chip when the staff register cannot be read", async () => {
    server.use(
      http.get("*/api/admin/staff", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    mockSearchParamsRef.current = new URLSearchParams("actorId=staff-olena");
    stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(
      screen.getByRole("button", {
        name: r.removeChipAria(d.chipActor(d.filterActorOther("staff-olena"))),
      }),
    ).toBeInTheDocument();

    const sheet = await openFilters();
    expect(
      within(sheet).getByRole("button", { name: d.filterActorMine }),
    ).toBeInTheDocument();
  });

  it("treats an actor filter as a filter for the empty state", async () => {
    mockSearchParamsRef.current = new URLSearchParams("actorRole=ADMIN");
    stubLog([]);
    renderWithProviders(<AuditLogView />);

    // «Немає записів за поточними фільтрами», not «Записів ще немає».
    expect(await screen.findByText(d.emptyFiltered)).toBeInTheDocument();
  });

  it("shows the filtered empty state for an action search too", async () => {
    mockSearchParamsRef.current = new URLSearchParams("action=order.refund");
    stubLog([]);
    renderWithProviders(<AuditLogView />);

    expect(await screen.findByText(d.emptyFiltered)).toBeInTheDocument();
  });
});

describe("AuditLogView — toolbar refresh", () => {
  it("refetches and announces completion on «Оновити»", async () => {
    const state = stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");
    expect(state.calls).toBe(1);

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() => expect(state.calls).toBe(2));
    // The announcement is what proves the tree sits inside a LiveAnnouncer.
    await waitFor(() =>
      expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
        dict.common.table.refreshed,
      ),
    );
  });
});

describe("AuditLogView — cards below md (Ж5)", () => {
  it("draws a card per entry with the time, who, the sentence and the day heading", async () => {
    setViewport(true);
    stubLog([
      makeEntry({
        actorId: "staff-olena",
        createdAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    ]);
    renderWithProviders(<AuditLogView />);

    const list = await screen.findByRole("list", { name: d.heading });
    expect(within(list).getByRole("heading", { level: 3 }).textContent).toMatch(
      /^Сьогодні, /,
    );
    const card = within(list).getAllByRole("listitem")[0];
    expect(card).toHaveTextContent("Олена Коваль");
    expect(card).toHaveTextContent("Змінено");
    expect(within(card).getByText(dict.staff.levelManager)).toBeInTheDocument();
  });
});
