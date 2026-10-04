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
import { AdminUserTable } from "./AdminUserTable";

const d = dict.users;
const r = dict.common.registry;

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSearchParamsRef = { current: new URLSearchParams("") };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => "/users",
  useSearchParams: () => mockSearchParamsRef.current,
}));

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "buyer@example.com",
    firstName: "Ivan",
    lastName: "Petrenko",
    phone: "0503182247",
    role: "CUSTOMER",
    isActive: true,
    emailVerifiedAt: null,
    lockedUntil: null,
    failedLoginAttempts: 0,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

/**
 * Answers like `GET /api/users` does: the page, filtered by `isActive` when
 * asked, with `meta.total` the count for that filter — which is also what the
 * quick-view counters read (one-row requests).
 */
function stubUsers(rows: Array<Record<string, unknown>> = [makeUserRow()]) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get("*/api/users", ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      const isActive = params.get("isActive");
      const matching =
        isActive === null
          ? rows
          : rows.filter((row) => String(row.isActive ?? true) === isActive);
      return HttpResponse.json({
        data: params.get("limit") === "1" ? matching.slice(0, 1) : matching,
        meta: {
          total: matching.length,
          page: 1,
          limit: 20,
          totalPages: matching.length === 0 ? 0 : 1,
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
    <WithAuth isOwner permissions={[]}>
      <AdminUserTable />
    </WithAuth>,
  );
}

const originalMatchMedia = window.matchMedia;

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

describe("AdminUserTable — rows (UsersProposal К1)", () => {
  it("names the customer, with the address under the name", async () => {
    stubUsers();
    renderTable();

    const name = await screen.findByText("Ivan Petrenko");
    expect(screen.getByText("buyer@example.com")).toBeInTheDocument();
    // The name is the row's real link (middle-click, keyboard, new tab).
    expect(name.closest("a")).toHaveAttribute("href", "/users/user-1");
  });

  it("falls back to the address when the shopper gave no name", async () => {
    stubUsers([makeUserRow({ firstName: null, lastName: null })]);
    renderTable();

    const link = await screen.findByRole("link", { name: "buyer@example.com" });
    expect(link).toHaveAttribute("href", "/users/user-1");
  });

  it("prints the phone in the +380 shape and a dash when there is none", async () => {
    stubUsers([
      makeUserRow(),
      makeUserRow({ id: "user-2", email: "nophone@example.com", phone: null }),
    ]);
    renderTable();

    expect(await screen.findByText("+380 50 318 2247")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: new RegExp(d.colPhone) }),
    ).toBeInTheDocument();
  });

  it("badges the status by the canon — grey for a switched-off account, never red", async () => {
    stubUsers([
      makeUserRow(),
      makeUserRow({ id: "off-1", email: "off@example.com", isActive: false }),
    ]);
    renderTable();

    expect(await screen.findByText(dict.common.inactive)).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(screen.getByText(dict.common.active)).toHaveAttribute(
      "data-variant",
      "default",
    );
  });

  it("offers «Відкрити» in the row's «⋯» menu — «Переглянути» moved there and to the row", async () => {
    stubUsers();
    renderTable();

    await userEvent.click(
      await screen.findByRole("button", {
        name: r.rowActionsAria("Ivan Petrenko"),
      }),
    );
    expect(
      await screen.findByRole("menuitem", { name: d.rowOpen }),
    ).toHaveAttribute("href", "/users/user-1");
  });

  it("offers no row selection — no bulk action on accounts", async () => {
    stubUsers();
    renderTable();

    await screen.findByText("Ivan Petrenko");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("AdminUserTable — quick views «Усі · Активні · Неактивні»", () => {
  it("counts each view from the API", async () => {
    stubUsers([
      makeUserRow(),
      makeUserRow({ id: "u-2", email: "b@example.com" }),
      makeUserRow({ id: "u-3", email: "c@example.com", isActive: false }),
    ]);
    renderTable();

    const tabs = await screen.findByRole("tablist");
    const [all, active, inactive] = within(tabs).getAllByRole("tab");
    await waitFor(() => expect(all).toHaveTextContent(`${d.viewAll}3`));
    expect(active).toHaveTextContent(`${d.viewActive}2`);
    expect(inactive).toHaveTextContent(`${d.viewInactive}1`);
    expect(all).toHaveAttribute("aria-selected", "true");
  });

  it("writes isActive=false for «Неактивні» and drops it for «Усі»", async () => {
    stubUsers();
    renderTable();
    await screen.findByText("Ivan Petrenko");

    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(`^${d.viewInactive}`) }),
    );
    expect(mockReplace).toHaveBeenLastCalledWith("/users?isActive=false");

    mockSearchParamsRef.current = new URLSearchParams("isActive=true");
    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(`^${d.viewAll}`) }),
    );
    expect(mockReplace).toHaveBeenLastCalledWith("/users");
  });
});

describe("AdminUserTable — toolbar", () => {
  it("names in the placeholder only what the API searches — no phone", async () => {
    stubUsers();
    renderTable();
    await screen.findByText("Ivan Petrenko");

    const search = screen.getByRole("searchbox", { name: d.searchAria });
    expect(search).toHaveAttribute("placeholder", d.searchPlaceholder);
    expect(d.searchPlaceholder).not.toMatch(/телефон/i);
  });

  it("applies the status filter from the sheet into the URL", async () => {
    stubUsers();
    renderTable();
    await screen.findByText("Ivan Petrenko");

    await userEvent.click(screen.getByRole("button", { name: r.filters }));
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(
      within(
        within(sheet).getByRole("group", { name: d.filterStatusAria }),
      ).getByRole("button", { name: d.viewInactive }),
    );
    await userEvent.click(
      within(sheet).getByRole("button", { name: d.filtersApply }),
    );

    expect(mockReplace).toHaveBeenLastCalledWith("/users?isActive=false");
  });

  it("shows the applied status as a chip, and removing it drops the filter", async () => {
    mockSearchParamsRef.current = new URLSearchParams("isActive=true");
    stubUsers();
    renderTable();

    const chip = await screen.findByRole("button", {
      name: r.removeChipAria(d.chipStatus(d.viewActive)),
    });
    await userEvent.click(chip);
    expect(mockReplace).toHaveBeenLastCalledWith("/users");
  });

  it("sends search, status and sort from the URL to the API", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "isActive=false&search=ivan&sortBy=email&sortOrder=asc",
    );
    const requests = stubUsers([makeUserRow({ isActive: false })]);
    renderTable();
    await screen.findByText("Ivan Petrenko");

    const page = requests.find((params) => params.get("limit") !== "1");
    expect(page?.get("isActive")).toBe("false");
    expect(page?.get("search")).toBe("ivan");
    expect(page?.get("sortBy")).toBe("email");
    expect(page?.get("sortOrder")).toBe("asc");
  });

  it("sorts by the customer column (address) and by registration date", async () => {
    stubUsers();
    renderTable();
    await screen.findByText("Ivan Petrenko");

    await userEvent.click(
      screen.getByRole("button", { name: new RegExp(d.colCustomer) }),
    );
    expect(mockReplace).toHaveBeenLastCalledWith(
      "/users?sortBy=email&sortOrder=desc",
    );
    expect(
      screen.getByRole("button", { name: new RegExp(d.colJoined) }),
    ).toBeInTheDocument();
    // The phone is not sortable server-side, so it is no sort button.
    expect(
      screen.queryByRole("button", { name: new RegExp(d.colPhone) }),
    ).not.toBeInTheDocument();
  });

  it("names the sort in the summary, with the API's total", async () => {
    stubUsers();
    renderTable();

    expect(
      await screen.findByText(r.summarySort(d.sortCreatedDesc), {
        exact: false,
      }),
    ).toBeInTheDocument();
    const summary = await screen.findByText(d.summaryFound, { exact: false });
    expect(summary.textContent).toBe(`${d.summaryFound} 1 клієнт`);
  });

  it("refetches the list when «Оновити» is pressed, and announces it", async () => {
    const requests = stubUsers();
    renderTable();
    await screen.findByText("Ivan Petrenko");
    const before = requests.length;

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() => expect(requests.length).toBeGreaterThan(before));
    await waitFor(() =>
      expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
        dict.common.table.refreshed,
      ),
    );
  });
});

/**
 * TASK-480 — this list is CUSTOMERS. The role filter, the role column and the
 * hiring CTA moved to `/staff` and must not come back with the redesign.
 */
describe("AdminUserTable — customers only", () => {
  it("offers no role filter and no role column", async () => {
    stubUsers();
    renderTable();
    await screen.findByText("Ivan Petrenko");

    await userEvent.click(screen.getByRole("button", { name: r.filters }));
    const sheet = await screen.findByRole("dialog");
    expect(
      within(sheet).queryByRole("group", { name: dict.staff.filterLevelAria }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: dict.staff.colLevel }),
    ).not.toBeInTheDocument();
  });

  it("offers no hiring CTA, populated or empty", async () => {
    stubUsers([]);
    renderTable();

    expect(await screen.findByText(d.emptyAllTitle)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.staff.create }),
    ).not.toBeInTheDocument();
  });
});

describe("AdminUserTable — two empty texts (К3)", () => {
  it("says nobody has registered yet when nothing narrows the list", async () => {
    stubUsers([]);
    renderTable();

    expect(await screen.findByText(d.emptyAllTitle)).toBeInTheDocument();
    expect(screen.getByText(d.emptyAllBody)).toBeInTheDocument();
  });

  it("blames the status filter, and offers to reset it, when the filter emptied the list", async () => {
    mockSearchParamsRef.current = new URLSearchParams("isActive=false");
    stubUsers([makeUserRow()]);
    renderTable();

    expect(
      await screen.findByText(d.emptyStatusTitle(false)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(d.emptyStatusBody(d.viewInactive)),
    ).toBeInTheDocument();
    expect(screen.queryByText(d.emptyAllTitle)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: d.emptyReset }));
    expect(mockReplace).toHaveBeenLastCalledWith("/users");
  });

  it("names the search term when a search found nobody", async () => {
    mockSearchParamsRef.current = new URLSearchParams("search=zzz");
    stubUsers([]);
    renderTable();

    expect(await screen.findByText(r.noResults("zzz"))).toBeInTheDocument();
  });
});

describe("AdminUserTable — 390 cards (К2)", () => {
  it("shows a card per customer with the phone and the status", async () => {
    setViewport(true);
    stubUsers();
    renderTable();

    const card = await screen.findByRole("listitem", { name: "Ivan Petrenko" });
    expect(within(card).getByText("+380 50 318 2247")).toBeInTheDocument();
    expect(within(card).getByText(dict.common.active)).toBeInTheDocument();
    expect(
      within(card).getByRole("button", {
        name: r.rowActionsAria("Ivan Petrenko"),
      }),
    ).toBeInTheDocument();
  });
});
