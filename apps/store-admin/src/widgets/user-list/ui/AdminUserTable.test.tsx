import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict } from "@/shared/config";
import { AdminUserTable } from "./AdminUserTable";

const mockReplace = jest.fn();
const mockSearchParamsRef = { current: new URLSearchParams("") };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/users",
  useSearchParams: () => mockSearchParamsRef.current,
}));

function makeUserRow() {
  return {
    id: "user-1",
    email: "buyer@example.com",
    firstName: "Ivan",
    lastName: "Petrenko",
    role: "CUSTOMER",
    isActive: true,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

function stubUsers() {
  server.use(
    http.get("*/api/users", () =>
      HttpResponse.json({
        data: [makeUserRow()],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
  );
}

/** An empty page — the state that carries the create CTA since TASK-406. */
function stubNoUsers() {
  server.use(
    http.get("*/api/users", () =>
      HttpResponse.json({
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      }),
    ),
  );
}

/**
 * TASK-334: the table reads the session to decide whether to offer the
 * owner-only «Створити співробітника» button. Owner by default, so the
 * pre-existing sorting/filter assertions are unaffected.
 */
function renderTable(options: { isOwner?: boolean } = {}) {
  return renderWithProviders(
    <WithAuth isOwner={options.isOwner ?? true} permissions={[]}>
      <AdminUserTable />
    </WithAuth>,
  );
}

describe("AdminUserTable — column sorting (TASK-147)", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  it("renders sortable Email and Joined headers", async () => {
    stubUsers();
    renderTable();
    await screen.findByText("buyer@example.com");

    expect(
      screen.getByRole("button", {
        name: dict.common.sortByAria(dict.users.colEmail),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: dict.common.sortByAria(dict.users.colJoined),
      }),
    ).toBeInTheDocument();
  });

  it("updates the URL with sortBy=email on the Email header click", async () => {
    stubUsers();
    renderTable();
    await screen.findByText("buyer@example.com");

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.common.sortByAria(dict.users.colEmail),
      }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("sortBy=email"),
    );
  });
});

describe("AdminUserTable — status filter (TASK-150 B5)", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  const openStatusFilter = async () =>
    userEvent.click(
      screen.getByRole("combobox", { name: dict.users.filterStatusAria }),
    );

  it("writes isActive=true to the URL when Active is selected", async () => {
    stubUsers();
    renderTable();
    await screen.findByText("buyer@example.com");

    await openStatusFilter();
    await userEvent.click(
      await screen.findByRole("option", { name: dict.common.active }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("isActive=true"),
    );
  });

  it("writes isActive=false to the URL when Inactive is selected", async () => {
    stubUsers();
    renderTable();
    await screen.findByText("buyer@example.com");

    await openStatusFilter();
    await userEvent.click(
      await screen.findByRole("option", { name: dict.common.inactive }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("isActive=false"),
    );
  });

  it("clears isActive from the URL when All statuses is selected", async () => {
    // Start from a filtered view so picking "All statuses" is a real change.
    mockSearchParamsRef.current = new URLSearchParams("isActive=false");
    stubUsers();
    renderTable();
    await screen.findByText("buyer@example.com");

    await openStatusFilter();
    await userEvent.click(
      await screen.findByRole("option", { name: dict.users.allStatuses }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.not.stringContaining("isActive"),
    );
  });
});

/**
 * TASK-480 — this list is CUSTOMERS, and the screen no longer pretends otherwise.
 *
 * `GET /api/users` has been scoped to `role: CUSTOMER` since TASK-476, which made
 * three of this table's controls actively misleading rather than merely
 * redundant: a role filter offering «Менеджер» returned nobody on a shop with
 * twenty of them, a role column could only ever read «Клієнт», and the empty
 * state offered a hiring button whose result would never appear in this list.
 * All three moved to `/staff`.
 */
describe("AdminUserTable — customers only", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  it("offers no role filter — every row here is a shopper", async () => {
    stubUsers();
    renderTable();
    await screen.findByText("buyer@example.com");

    expect(
      screen.queryByRole("combobox", { name: dict.staff.filterLevelAria }),
    ).not.toBeInTheDocument();
    // The status filter is still this table's own control and must survive.
    expect(
      screen.getByRole("combobox", { name: dict.users.filterStatusAria }),
    ).toBeInTheDocument();
  });

  it("offers no hiring CTA, populated or empty", async () => {
    stubNoUsers();
    renderTable();

    expect(await screen.findByText(dict.users.empty)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.staff.create }),
    ).not.toBeInTheDocument();
  });

  it("does not render a role column that could only say «Клієнт»", async () => {
    stubUsers();
    renderTable();
    await screen.findByText("buyer@example.com");

    expect(
      screen.queryByRole("columnheader", { name: dict.staff.colLevel }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(dict.users.roleCustomer)).not.toBeInTheDocument();
  });
});

/**
 * TASK-356 — the panel pins `staleTime` to five minutes, so before the toolbar
 * there was no way to see an account another admin had just deactivated.
 */
describe("AdminUserTable — toolbar refresh", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  function stubCountingUsers() {
    const state = { calls: 0 };
    server.use(
      http.get("*/api/users", () => {
        state.calls += 1;
        return HttpResponse.json({
          data: [makeUserRow()],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        });
      }),
    );
    return state;
  }

  it("refetches the list when «Оновити» is pressed", async () => {
    const state = stubCountingUsers();
    renderTable();
    await screen.findByText("buyer@example.com");
    expect(state.calls).toBe(1);

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() => expect(state.calls).toBe(2));
  });

  it("announces completion — i.e. the tree really is inside a LiveAnnouncer", async () => {
    // The toolbar calls `useAnnouncer()` unconditionally and that hook silently
    // no-ops outside the provider, so forgetting the wrapper costs the refresh
    // its only feedback for a screen-reader user without breaking anything
    // visible. Assert the announcement, not the wrapper.
    stubCountingUsers();
    renderTable();
    await screen.findByText("buyer@example.com");

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
        dict.common.table.refreshed,
      ),
    );
  });
});
