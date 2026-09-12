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
