import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminSubscriberTable } from "./AdminSubscriberTable";

const mockReplace = jest.fn();
const mockSearchParamsRef = { current: new URLSearchParams("") };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/subscribers",
  useSearchParams: () => mockSearchParamsRef.current,
}));

function makeSubscriberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    email: "buyer@example.com",
    status: "SUBSCRIBED",
    source: "home",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    unsubscribedAt: null,
    ...overrides,
  };
}

/**
 * Stub the list and record every request the hook makes — the sort assertions
 * below care about what reached the API, not only about what the URL says.
 */
function stubList(rows = [makeSubscriberRow()]) {
  const state = { calls: 0, params: [] as URLSearchParams[] };
  server.use(
    http.get("*/api/newsletter/admin", ({ request }) => {
      state.calls += 1;
      state.params.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        data: rows,
        meta: { total: rows.length, page: 1, limit: 20, totalPages: 1 },
      });
    }),
  );
  return state;
}

const lastParams = (state: ReturnType<typeof stubList>) =>
  state.params[state.params.length - 1];

describe("AdminSubscriberTable", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  it("renders subscriber rows (email, status badge, source)", async () => {
    stubList();
    renderWithProviders(<AdminSubscriberTable />);

    expect(await screen.findByText("buyer@example.com")).toBeInTheDocument();
    expect(
      screen.getByText(dict.subscribers.statusSubscribed),
    ).toBeInTheDocument();
    expect(screen.getByText("home")).toBeInTheDocument();
  });

  it("shows the empty state when there are no subscribers", async () => {
    stubList([]);
    renderWithProviders(<AdminSubscriberTable />);

    expect(await screen.findByText(dict.subscribers.empty)).toBeInTheDocument();
  });

  it("pushes the status filter into the URL", async () => {
    stubList();
    renderWithProviders(<AdminSubscriberTable />);
    await screen.findByText("buyer@example.com");

    await userEvent.click(
      screen.getByRole("combobox", { name: dict.subscribers.filterStatusAria }),
    );
    await userEvent.click(
      screen.getByRole("option", { name: dict.subscribers.statusUnsubscribed }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      "/subscribers?status=UNSUBSCRIBED",
    );
  });

  it("exports the filtered subscribers as a CSV download", async () => {
    stubList();
    let exportHit = false;
    server.use(
      http.get("*/api/newsletter/admin/export", () => {
        exportHit = true;
        return new HttpResponse(
          "email,status,source,createdAt\nbuyer@example.com,SUBSCRIBED,home,2026-06-01T10:00:00.000Z",
          { headers: { "Content-Type": "text/csv" } },
        );
      }),
    );

    const createObjectURL = jest.fn(() => "blob:mock-url");
    const revokeObjectURL = jest.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    renderWithProviders(<AdminSubscriberTable />);
    await screen.findByText("buyer@example.com");

    await userEvent.click(
      screen.getByRole("button", { name: dict.subscribers.exportCsv }),
    );

    await waitFor(() => expect(exportHit).toBe(true));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(clickSpy).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
  });
});

/**
 * TASK-356 — server-side sorting on the three columns `NEWSLETTER_SORT_FIELDS`
 * allows, plus the toolbar's manual refresh.
 */
describe("AdminSubscriberTable — sorting and refresh", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  it("offers sortable Email, Status and Date headers — and none on Source", async () => {
    stubList();
    renderWithProviders(<AdminSubscriberTable />);
    await screen.findByText("buyer@example.com");

    for (const label of [
      dict.subscribers.colEmail,
      dict.subscribers.colStatus,
      dict.subscribers.colDate,
    ]) {
      expect(
        screen.getByRole("button", { name: dict.common.sortByAria(label) }),
      ).toBeInTheDocument();
    }
    // `source` is null on most rows, so sorting it would produce one meaningful
    // block and a long tail of blanks — the DTO does not accept it either.
    expect(
      screen.queryByRole("button", {
        name: dict.common.sortByAria(dict.subscribers.colSource),
      }),
    ).not.toBeInTheDocument();
  });

  it("writes sortBy=email into the URL on the Email header click", async () => {
    stubList();
    renderWithProviders(<AdminSubscriberTable />);
    await screen.findByText("buyer@example.com");

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.common.sortByAria(dict.subscribers.colEmail),
      }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("sortBy=email"),
    );
  });

  it("forwards the URL's sort to the API", async () => {
    // The failure this guards against is a header that renders as sorted over
    // rows nobody reordered: sort state in the URL that never reaches the query.
    mockSearchParamsRef.current = new URLSearchParams(
      "sortBy=status&sortOrder=asc",
    );
    const state = stubList();
    renderWithProviders(<AdminSubscriberTable />);
    await screen.findByText("buyer@example.com");

    expect(lastParams(state).get("sortBy")).toBe("status");
    expect(lastParams(state).get("sortOrder")).toBe("asc");
  });

  it("refetches and announces completion on «Оновити»", async () => {
    const state = stubList();
    renderWithProviders(<AdminSubscriberTable />);
    await screen.findByText("buyer@example.com");
    expect(state.calls).toBe(1);

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() => expect(state.calls).toBe(2));
    // Announcement proves the tree is inside a LiveAnnouncer: `useAnnouncer()`
    // no-ops outside one, so the omission would be invisible.
    await waitFor(() =>
      expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
        dict.common.table.refreshed,
      ),
    );
  });
});
