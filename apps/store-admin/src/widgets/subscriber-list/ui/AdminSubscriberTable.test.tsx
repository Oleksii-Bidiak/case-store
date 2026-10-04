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
import { AdminSubscriberTable } from "./AdminSubscriberTable";

const d = dict.subscribers;
const r = dict.common.registry;

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
 * Answers like `GET /api/newsletter/admin`: filtered by `status` when asked,
 * `meta.total` the count for that filter — also what the view counters read
 * (one-row requests). Every request is recorded.
 */
function stubList(
  rows: Array<Record<string, unknown>> = [makeSubscriberRow()],
) {
  const state = { calls: 0, params: [] as URLSearchParams[] };
  server.use(
    http.get("*/api/newsletter/admin", ({ request }) => {
      state.calls += 1;
      const params = new URL(request.url).searchParams;
      state.params.push(params);
      const status = params.get("status");
      const matching =
        status === null ? rows : rows.filter((row) => row.status === status);
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
  return state;
}

/** The page request — not the one-row counters. */
const pageParams = (state: ReturnType<typeof stubList>) =>
  [...state.params].reverse().find((params) => params.get("limit") !== "1");

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

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParamsRef.current = new URLSearchParams("");
  localStorage.clear();
  setViewport(false);
});

afterAll(() => {
  window.matchMedia = originalMatchMedia;
});

describe("AdminSubscriberTable — rows (ПД1/ПД2)", () => {
  it("renders the email, the status badge and the source in words", async () => {
    stubList();
    renderWithProviders(<AdminSubscriberTable />);

    expect(await screen.findByText("buyer@example.com")).toBeInTheDocument();
    expect(screen.getByText(d.statusSubscribed)).toHaveAttribute(
      "data-variant",
      "default",
    );
    expect(screen.getByText(d.sourceHome)).toBeInTheDocument();
    expect(screen.queryByText("home")).not.toBeInTheDocument();
  });

  it.each([
    ["home", () => d.sourceHome],
    ["promo", () => d.sourcePromo],
    ["blog", () => d.sourceBlog],
    ["footer", () => d.sourceFooter],
  ])("names the source %s for a person", async (source, label) => {
    stubList([makeSubscriberRow({ source })]);
    renderWithProviders(<AdminSubscriberTable />);

    expect(await screen.findByText(label())).toBeInTheDocument();
  });

  it("shows an unknown source key as it is, and a dash for none", async () => {
    stubList([
      makeSubscriberRow({ source: "tiktok" }),
      makeSubscriberRow({ id: "sub-2", email: "b@example.com", source: null }),
    ]);
    renderWithProviders(<AdminSubscriberTable />);

    expect(await screen.findByText("tiktok")).toBeInTheDocument();
  });

  it("shows when somebody unsubscribed — the date was on the wire and nowhere on screen", async () => {
    stubList([
      makeSubscriberRow({
        status: "UNSUBSCRIBED",
        unsubscribedAt: "2026-09-21T10:00:00.000Z",
      }),
    ]);
    renderWithProviders(<AdminSubscriberTable />);

    expect(await screen.findByText("21.09.2026")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", {
        name: new RegExp(d.colUnsubscribed),
      }),
    ).toBeInTheDocument();
    // Badge canon: an unsubscribe is a state, not an error — grey, never red.
    expect(
      screen
        .getAllByText(d.statusUnsubscribed)
        .find((node) => node.hasAttribute("data-variant")),
    ).toHaveAttribute("data-variant", "secondary");
  });
});

describe("AdminSubscriberTable — views «Підписані · Відписані · Усі»", () => {
  it("counts each view from the API", async () => {
    stubList([
      makeSubscriberRow(),
      makeSubscriberRow({ id: "s-2", email: "b@example.com" }),
      makeSubscriberRow({
        id: "s-3",
        email: "c@example.com",
        status: "UNSUBSCRIBED",
      }),
    ]);
    renderWithProviders(<AdminSubscriberTable />);

    const tabs = await screen.findByRole("tablist");
    const [subscribed, unsubscribed, all] = within(tabs).getAllByRole("tab");
    await waitFor(() => expect(all).toHaveTextContent(`${d.viewAll}3`));
    expect(subscribed).toHaveTextContent(`${d.viewSubscribed}2`);
    expect(unsubscribed).toHaveTextContent(`${d.viewUnsubscribed}1`);
    // Landing on «Усі», as before — no filter until somebody picks one.
    expect(all).toHaveAttribute("aria-selected", "true");
  });

  it("writes the status into the URL and drops it for «Усі»", async () => {
    stubList();
    renderWithProviders(<AdminSubscriberTable />);
    await screen.findByText("buyer@example.com");

    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(`^${d.viewUnsubscribed}`) }),
    );
    expect(mockReplace).toHaveBeenLastCalledWith(
      "/subscribers?status=UNSUBSCRIBED",
    );

    mockSearchParamsRef.current = new URLSearchParams("status=SUBSCRIBED");
    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(`^${d.viewAll}`) }),
    );
    expect(mockReplace).toHaveBeenLastCalledWith("/subscribers");
  });

  it("breaks «Усі» down in the summary", async () => {
    stubList([
      makeSubscriberRow(),
      makeSubscriberRow({
        id: "s-3",
        email: "c@example.com",
        status: "UNSUBSCRIBED",
      }),
    ]);
    renderWithProviders(<AdminSubscriberTable />);

    const summary = await screen.findByText(d.summaryFound, { exact: false });
    await waitFor(() =>
      expect(summary.textContent).toBe(
        `${d.summaryFound} 2 підписники · ${d.summaryBreakdown(1, 1)}`,
      ),
    );
  });
});

describe("AdminSubscriberTable — toolbar", () => {
  it("applies the status filter from «Фільтри» into the URL", async () => {
    stubList();
    renderWithProviders(<AdminSubscriberTable />);
    await screen.findByText("buyer@example.com");

    await userEvent.click(screen.getByRole("button", { name: r.filters }));
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(
      within(
        within(sheet).getByRole("group", { name: d.filterStatusAria }),
      ).getByRole("button", { name: d.viewUnsubscribed }),
    );
    await userEvent.click(
      within(sheet).getByRole("button", { name: d.filtersApply }),
    );

    expect(mockReplace).toHaveBeenLastCalledWith(
      "/subscribers?status=UNSUBSCRIBED",
    );
  });

  it("shows the search and the status as chips, each removable (ПД8)", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "search=gmail&status=SUBSCRIBED",
    );
    stubList();
    renderWithProviders(<AdminSubscriberTable />);

    await userEvent.click(
      await screen.findByRole("button", {
        name: r.removeChipAria(d.chipSearch("gmail")),
      }),
    );
    expect(mockReplace).toHaveBeenLastCalledWith(
      "/subscribers?status=SUBSCRIBED",
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: r.removeChipAria(d.chipStatus(d.viewSubscribed)),
      }),
    );
    expect(mockReplace).toHaveBeenLastCalledWith("/subscribers?search=gmail");
  });

  it("sends search, status and sort from the URL to the API", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "search=gmail&status=UNSUBSCRIBED&sortBy=status&sortOrder=asc",
    );
    const state = stubList([makeSubscriberRow({ status: "UNSUBSCRIBED" })]);
    renderWithProviders(<AdminSubscriberTable />);
    await screen.findByText("buyer@example.com");

    const params = pageParams(state);
    expect(params?.get("search")).toBe("gmail");
    expect(params?.get("status")).toBe("UNSUBSCRIBED");
    expect(params?.get("sortBy")).toBe("status");
    expect(params?.get("sortOrder")).toBe("asc");
  });

  it("sorts by Email, Status and «Підписався» — and not by Source", async () => {
    stubList();
    renderWithProviders(<AdminSubscriberTable />);
    await screen.findByText("buyer@example.com");

    for (const label of [d.colEmail, d.colStatus, d.colDate]) {
      expect(
        screen.getByRole("button", { name: new RegExp(label) }),
      ).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: new RegExp(d.colSource) }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: new RegExp(d.colEmail) }),
    );
    expect(mockReplace).toHaveBeenLastCalledWith(
      "/subscribers?sortBy=email&sortOrder=desc",
    );
  });

  it("refetches and announces completion on «Оновити»", async () => {
    const state = stubList();
    renderWithProviders(<AdminSubscriberTable />);
    await screen.findByText("buyer@example.com");
    const before = state.calls;

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() => expect(state.calls).toBeGreaterThan(before));
    await waitFor(() =>
      expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
        dict.common.table.refreshed,
      ),
    );
  });
});

describe("AdminSubscriberTable — «Експорт ▾» (ПД7)", () => {
  it("exports the filtered subscribers as a CSV download with the BOM", async () => {
    mockSearchParamsRef.current = new URLSearchParams("status=SUBSCRIBED");
    stubList();
    const exportRequests: URLSearchParams[] = [];
    server.use(
      http.get("*/api/newsletter/admin/export", ({ request }) => {
        exportRequests.push(new URL(request.url).searchParams);
        return new HttpResponse(
          "email,status,source,createdAt\nbuyer@example.com,SUBSCRIBED,home,2026-06-01T10:00:00.000Z",
          { headers: { "Content-Type": "text/csv" } },
        );
      }),
    );

    const blobs: Blob[] = [];
    const createObjectURL = jest.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:mock-url";
    });
    URL.createObjectURL =
      createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = jest.fn();
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    renderWithProviders(<AdminSubscriberTable />);
    await screen.findByText("buyer@example.com");

    await userEvent.click(screen.getByRole("button", { name: r.exportLabel }));
    expect(await screen.findByText(d.exportFootnote)).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: r.exportCsv }),
    );

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(exportRequests).toHaveLength(1);
    expect(exportRequests[0].get("status")).toBe("SUBSCRIBED");
    const bytes = new Uint8Array(await blobs[0].arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    clickSpy.mockRestore();
  });

  it("offers no XLSX — nothing writes it yet", async () => {
    stubList();
    renderWithProviders(<AdminSubscriberTable />);
    await screen.findByText("buyer@example.com");

    await userEvent.click(screen.getByRole("button", { name: r.exportLabel }));
    await screen.findByRole("menuitem", { name: r.exportCsv });
    expect(
      screen.queryByRole("menuitem", { name: r.exportXlsx }),
    ).not.toBeInTheDocument();
  });
});

describe("AdminSubscriberTable — two empty texts (ПД8)", () => {
  it("says nobody has subscribed yet when nothing narrows the list", async () => {
    stubList([]);
    renderWithProviders(<AdminSubscriberTable />);

    expect(await screen.findByText(d.emptyAllTitle)).toBeInTheDocument();
    expect(screen.getByText(d.emptyAllBody)).toBeInTheDocument();
  });

  it("names the search, and offers to reset it, when a search found nobody", async () => {
    mockSearchParamsRef.current = new URLSearchParams("search=gmail");
    stubList([]);
    renderWithProviders(<AdminSubscriberTable />);

    expect(
      await screen.findByText(d.emptySearchTitle("gmail")),
    ).toBeInTheDocument();
    expect(screen.queryByText(d.emptyAllTitle)).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: d.emptySearchReset }),
    );
    expect(mockReplace).toHaveBeenLastCalledWith("/subscribers");
  });

  it("blames the status when only the status emptied the list", async () => {
    mockSearchParamsRef.current = new URLSearchParams("status=UNSUBSCRIBED");
    stubList([makeSubscriberRow()]);
    renderWithProviders(<AdminSubscriberTable />);

    expect(
      await screen.findByText(d.emptyStatusTitle(d.statusUnsubscribed)),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: d.emptyReset }));
    expect(mockReplace).toHaveBeenLastCalledWith("/subscribers");
  });
});

describe("AdminSubscriberTable — subscriber card (ПД3, existing fields only)", () => {
  it("opens a sheet from the row's «⋯» with what the API knows", async () => {
    stubList([
      makeSubscriberRow({
        status: "UNSUBSCRIBED",
        source: "promo",
        unsubscribedAt: "2026-09-21T10:00:00.000Z",
      }),
    ]);
    renderWithProviders(<AdminSubscriberTable />);

    await userEvent.click(
      await screen.findByRole("button", {
        name: r.rowActionsAria("buyer@example.com"),
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.rowOpen }),
    );

    const sheet = await screen.findByRole("dialog", {
      name: "buyer@example.com",
    });
    expect(within(sheet).getByText(d.cardSection)).toBeInTheDocument();
    expect(within(sheet).getByText(d.sourcePromo)).toBeInTheDocument();
    expect(within(sheet).getByText("21.09.2026, 13:00")).toBeInTheDocument();
  });

  it("opens the same sheet from the email in the row", async () => {
    stubList();
    renderWithProviders(<AdminSubscriberTable />);

    await userEvent.click(
      await screen.findByRole("button", { name: "buyer@example.com" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "buyer@example.com" }),
    ).toBeInTheDocument();
  });
});

describe("AdminSubscriberTable — 390 cards (ПД6)", () => {
  it("shows a card per subscriber with the status, the source and the date", async () => {
    setViewport(true);
    stubList();
    renderWithProviders(<AdminSubscriberTable />);

    const card = await screen.findByRole("listitem", {
      name: "buyer@example.com",
    });
    expect(within(card).getByText(d.statusSubscribed)).toBeInTheDocument();
    expect(
      within(card).getByText(d.sourceHome, { exact: false }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("button", {
        name: r.rowActionsAria("buyer@example.com"),
      }),
    ).toBeInTheDocument();
  });
});
