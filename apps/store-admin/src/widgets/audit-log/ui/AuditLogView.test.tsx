import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AuditLogView } from "./AuditLogView";

const mockReplace = jest.fn();
const mockSearchParamsRef = { current: new URLSearchParams("") };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/audit-log",
  useSearchParams: () => mockSearchParamsRef.current,
}));

// TASK-430: the «Мої дії» filter needs the viewer's own id, so the view now reads
// the auth context. Same stub as UserDetailView's suite — this widget renders
// without an <AuthProvider>.
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

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "log-1",
    actorId: "user-1",
    actorEmail: "manager@example.com",
    actorRole: "MANAGER",
    action: "product.update",
    entityType: "Product",
    entityId: "prod-1",
    summary: null,
    diff: null,
    createdAt: "2026-07-29T10:00:00.000Z",
    ...overrides,
  };
}

/**
 * Stub the log and record every request — the sort assertions care about what
 * reached the API, not only about what the URL says.
 */
function stubLog(rows = [makeEntry()]) {
  const state = { calls: 0, params: [] as URLSearchParams[] };
  server.use(
    http.get("*/api/admin/audit-log", ({ request }) => {
      state.calls += 1;
      state.params.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        data: rows,
        meta: { total: rows.length, page: 1, limit: 50, totalPages: 1 },
      });
    }),
  );
  return state;
}

const lastParams = (state: ReturnType<typeof stubLog>) =>
  state.params[state.params.length - 1];

const d = dict.auditLog;

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParamsRef.current = new URLSearchParams("");
});

describe("AuditLogView — rows", () => {
  it("renders an entry with its actor and action", async () => {
    stubLog();
    renderWithProviders(<AuditLogView />);

    expect(await screen.findByText("manager@example.com")).toBeInTheDocument();
    expect(screen.getByText("product.update")).toBeInTheDocument();
  });

  it("shows the filtered empty state when a filter is active", async () => {
    mockSearchParamsRef.current = new URLSearchParams("action=order.refund");
    stubLog([]);
    renderWithProviders(<AuditLogView />);

    expect(await screen.findByText(d.emptyFiltered)).toBeInTheDocument();
  });
});

/**
 * TASK-356 — sorting was added to `AuditLogQueryDto` for exactly these three
 * columns. The entity column stays unsorted on purpose: its cell is a type/id
 * pair and ordering by the type alone would sort half a column while looking
 * like it sorted all of it.
 */
describe("AuditLogView — sorting", () => {
  it("offers sortable When, Who and Action headers — and none on Entity", async () => {
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

  it("writes sortBy=actorEmail into the URL on the Who header click", async () => {
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

  it("forwards the URL's sort to the API", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "sortBy=action&sortOrder=asc",
    );
    const state = stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(lastParams(state).get("sortBy")).toBe("action");
    expect(lastParams(state).get("sortOrder")).toBe("asc");
  });
});

/**
 * TASK-356 moved filters and page off `useState` and into the query string.
 * This was the one admin table whose view could not be reloaded or pasted to a
 * colleague — backwards for the screen you open to show someone what happened.
 */
describe("AuditLogView — URL-driven filters", () => {
  it("seeds both controls from the URL so a reload keeps the view", async () => {
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
      screen.getByRole("combobox", { name: d.filterEntityAria }),
    ).toHaveTextContent(d.entityLabels.order);
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
   * TASK-423. `AuditRepository` matches `entityType` EXACTLY, so the free-text
   * box this replaces could only be used by someone who already knew the exact
   * wire value — and its own placeholder suggested «Product» while the
   * interceptor writes `product`. Every near miss answered «Немає записів»,
   * which is also what an empty log says, so the mistake was invisible.
   */
  it("offers the entity type as a CHOICE, spelled the way the server stores it", async () => {
    stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    await userEvent.click(
      screen.getByRole("combobox", { name: d.filterEntityAria }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: d.entityLabels.product }),
    );

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("entityType=product"),
      ),
    );
    // The wire value, not the Ukrainian label the operator picked.
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
        name: dict.common.table.clearFilterAria(
          d.filterEntityAria,
          d.entityLabels.product,
        ),
      }),
    );

    expect(mockReplace).toHaveBeenCalledWith("/audit-log");
  });

  /**
   * The list of entity types is a hand-kept mirror of a server-side rule
   * (controller class name → `entityType`), so it can fall behind a new module.
   * When it does, the value still filters and must still be clearable — the
   * guarantee is "everything offered exists", not "everything that exists is
   * offered".
   */
  it("still names and clears an entity type it does not know about", async () => {
    mockSearchParamsRef.current = new URLSearchParams("entityType=warehouse");
    const state = stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(lastParams(state).get("entityType")).toBe("warehouse");
    expect(
      screen.getByRole("button", {
        name: dict.common.table.clearFilterAria(
          d.filterEntityAria,
          "warehouse",
        ),
      }),
    ).toBeInTheDocument();
  });
});

/**
 * TASK-423 — the log used to page at 50 with no control anywhere, while every
 * other admin table paged at 20. "Page 3" meant a different position here than
 * on the screen next door.
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
 * TASK-430 — the «Дія» column printed `order.updateStatus` at an owner and called
 * it a log. The label is composed from the entity name and the verb; see
 * `model/action-label.ts`.
 */
describe("AuditLogView — Ukrainian action labels", () => {
  it("shows the Ukrainian label AND keeps the raw key the filter needs", async () => {
    stubLog([makeEntry({ action: "order.updateStatus" })]);
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(
      screen.getByText(
        d.actionLabel(d.entityLabels.order, d.actionVerbs.updateStatus),
      ),
    ).toBeInTheDocument();
    // The search box matches `action` EXACTLY on the server, so the key is the
    // only thing an operator can type — hiding it would make the panel readable
    // and the filter unusable in one move.
    expect(screen.getByText("order.updateStatus")).toBeInTheDocument();
  });

  it("falls back to the raw key for an action it cannot name", async () => {
    // A new guarded route appears in the log before anyone adds its label. The row
    // must degrade to what the column showed before labels existed — never vanish
    // and never claim «Невідома дія».
    stubLog([makeEntry({ action: "warehouse.rebalance" })]);
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(screen.getByText("warehouse.rebalance")).toBeInTheDocument();
  });
});

/**
 * TASK-430 — «мої дії / інші співробітники». Two axes, one query param each,
 * because `TableFilters` owns exactly one param per control.
 */
describe("AuditLogView — actor filters", () => {
  it("offers «Мої дії» and sends the viewer's own id", async () => {
    stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    await userEvent.click(
      screen.getByRole("combobox", { name: d.filterActorAria }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: d.filterActorMine }),
    );

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
        name: dict.common.table.clearFilterAria(
          d.filterRoleAria,
          dict.users.roleManager,
        ),
      }),
    ).toBeInTheDocument();
  });

  it("seeds «Мої дії» from the URL rather than showing a raw uuid", async () => {
    mockSearchParamsRef.current = new URLSearchParams(`actorId=${VIEWER_ID}`);
    stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(
      screen.getByRole("combobox", { name: d.filterActorAria }),
    ).toHaveTextContent(d.filterActorMine);
  });

  it("names and clears a COLLEAGUE's id arriving from a shared link", async () => {
    // The whole point of putting this screen's state in the URL is pasting a view
    // to someone. A uuid that is not the viewer's own must still read as a filter
    // and still be clearable — otherwise the recipient sees a short list with no
    // visible reason.
    mockSearchParamsRef.current = new URLSearchParams("actorId=other-uuid-2");
    const state = stubLog();
    renderWithProviders(<AuditLogView />);
    await screen.findByText("manager@example.com");

    expect(lastParams(state).get("actorId")).toBe("other-uuid-2");
    expect(
      screen.getByRole("button", {
        name: dict.common.table.clearFilterAria(
          d.filterActorAria,
          d.filterActorOther("other-uuid-2"),
        ),
      }),
    ).toBeInTheDocument();
  });

  it("treats an actor filter as a filter for the empty state", async () => {
    mockSearchParamsRef.current = new URLSearchParams("actorRole=ADMIN");
    stubLog([]);
    renderWithProviders(<AuditLogView />);

    // «Немає записів за поточними фільтрами», not «Записів ще немає» — the second
    // would say the log is empty when it is merely narrowed.
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
    // The announcement is what proves the tree sits inside a LiveAnnouncer:
    // `useAnnouncer()` no-ops outside one, so the omission is otherwise silent.
    await waitFor(() =>
      expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
        dict.common.table.refreshed,
      ),
    );
  });
});
