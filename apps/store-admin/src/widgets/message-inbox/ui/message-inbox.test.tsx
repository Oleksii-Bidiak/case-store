import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { PERM } from "@/entities/permission";
import { countLabel } from "@/shared/lib";
import { dict } from "@/shared/config";
import { MessageInbox } from "./message-inbox";

// next/navigation is unavailable under jsdom — mock the router + URL state.
const mockReplace = jest.fn();
const mockSearchParamsRef = { current: new URLSearchParams("") };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/messages",
  useSearchParams: () => mockSearchParamsRef.current,
}));

const d = dict.messages;
const r = dict.common.registry;

function makeMessageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-uuid-1",
    name: "Ivan Petrenko",
    phone: "+380671234567",
    email: "ivan@example.com",
    topic: "delivery",
    orderRef: "ORD-10231",
    message: "Доброго дня! Питання по замовленню.",
    status: "NEW",
    adminNote: null,
    matchedUserId: null,
    createdAt: "2026-07-05T10:00:00.000Z",
    updatedAt: "2026-07-05T10:00:00.000Z",
    ...overrides,
  };
}

function listResponse(rows: unknown[], meta: Record<string, number> = {}) {
  return HttpResponse.json({
    data: rows,
    meta: {
      total: rows.length,
      page: 1,
      limit: 20,
      totalPages: 1,
      unread: rows.length,
      ...meta,
    },
  });
}

/**
 * Stubs the inbox. The view counters ask for one-row pages (`limit=1`), keyed
 * here by status (`""` = «Усі»); the returned params are the TABLE's requests.
 */
function stubInbox(
  rows: unknown[] = [makeMessageRow()],
  counts: Record<string, number> = {},
) {
  const params: URLSearchParams[] = [];
  server.use(
    http.get("*/api/contact/admin", ({ request }) => {
      const query = new URL(request.url).searchParams;
      if (query.get("limit") === "1") {
        return listResponse([], {
          total: counts[query.get("status") ?? ""] ?? 0,
        });
      }
      params.push(query);
      return listResponse(rows);
    }),
  );
  return params;
}

/** A manager who may work the inbox — the default for these cases. */
const WRITER = [PERM.messagesRead, PERM.messagesWrite];

function renderInbox(permissions: string[] = WRITER) {
  return renderWithProviders(
    <WithAuth permissions={permissions}>
      <MessageInbox />
    </WithAuth>,
  );
}

const rowMenu = (name = "Ivan Petrenko") =>
  screen.getByRole("button", { name: r.rowActionsAria(d.rowAria(name)) });

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParamsRef.current = new URLSearchParams("");
});

describe("MessageInbox — rows (MessagesProposal З1)", () => {
  it("renders sender, phone in +380 form, topic in words, snippet and status", async () => {
    stubInbox([
      makeMessageRow(),
      makeMessageRow({
        id: "msg-uuid-2",
        name: "Olena Koval",
        status: "READ",
        topic: "warranty",
        message: "Дякую за швидку відповідь!",
      }),
    ]);
    renderInbox();

    expect(await screen.findByText("Ivan Petrenko")).toBeInTheDocument();
    expect(screen.getByText("Olena Koval")).toBeInTheDocument();
    expect(screen.getAllByText("+380 67 123 4567")).toHaveLength(2);
    expect(screen.getByText(d.topicDelivery)).toBeInTheDocument();
    expect(screen.getByText(d.topicWarranty)).toBeInTheDocument();
    expect(
      screen.getByText("Доброго дня! Питання по замовленню."),
    ).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText(d.statusNew)).toBeInTheDocument();
    expect(within(table).getByText(d.statusRead)).toBeInTheDocument();
  });

  /**
   * TASK-734 — at 1440 a long message ran over «Статус» and «Отримано»
   * (`max-w-xs` + `nowrap`). The text now wraps inside a fixed-width column
   * and stops at two lines; the whole text is one click away in the panel.
   */
  it("clamps the message text to two lines inside its fixed-width column (TASK-734)", async () => {
    const long = "Дуже довге повідомлення без жодного переносу. ".repeat(30);
    stubInbox([makeMessageRow({ message: long })]);
    renderInbox();

    const text = await screen.findByText(long.trim());
    expect(text).toHaveClass("line-clamp-2");
    expect(text).not.toHaveClass("whitespace-nowrap");
    const cell = text.closest("td");
    expect(cell).toHaveAttribute("data-column-id", "message");
    // The cell clips and wraps rather than growing past its column.
    expect(cell).toHaveClass("overflow-hidden", "break-words");
    const header = screen
      .getAllByRole("columnheader")
      .find((th) => th.getAttribute("data-column-id") === "message");
    expect(header).toHaveStyle({ width: "320px" });
  });

  it("marks a NEW message with a dot and a tinted row", async () => {
    stubInbox([
      makeMessageRow(),
      makeMessageRow({ id: "msg-uuid-2", name: "Olena Koval", status: "READ" }),
    ]);
    renderInbox();

    const fresh = (await screen.findByText("Ivan Petrenko")).closest("tr");
    const read = screen.getByText("Olena Koval").closest("tr");
    expect(within(fresh!).getByLabelText(d.statusNew)).toBeInTheDocument();
    expect(fresh).toHaveClass("bg-primary/6");
    expect(within(read!).queryByLabelText(d.statusNew)).not.toBeInTheDocument();
    expect(read).not.toHaveClass("bg-primary/6");
  });

  it("links an order number to the order search, as the panel prints it", async () => {
    stubInbox([
      makeMessageRow({ orderRef: "#7c1e9a42" }),
      makeMessageRow({ id: "msg-uuid-2", name: "Olena Koval" }),
    ]);
    renderInbox([...WRITER, PERM.ordersRead]);

    const link = await screen.findByRole("link", {
      name: d.orderLinkAria("#7C1E9A42"),
    });
    expect(link).toHaveAttribute("href", "/orders?search=7C1E9A42");
    expect(link).toHaveTextContent("#7C1E9A42");
    // Free text the customer typed is not a guessable order — no link.
    expect(screen.getByText("ORD-10231")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /ORD-10231/ }),
    ).not.toBeInTheDocument();
  });

  it("prints the order number without a link for a session that cannot read orders", async () => {
    stubInbox([makeMessageRow({ orderRef: "#7c1e9a42" })]);
    renderInbox();

    expect(await screen.findByText("#7C1E9A42")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: d.orderLinkAria("#7C1E9A42") }),
    ).not.toBeInTheDocument();
  });

  it("opens the side panel on a row click", async () => {
    stubInbox();
    renderInbox();

    await userEvent.click(await screen.findByText(d.topicDelivery));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText(d.sourceForm)).toBeInTheDocument();
  });

  it("opens the side panel from «⋯ → Відкрити» and marks the message read", async () => {
    let patched: { id?: string; body?: unknown } = {};
    stubInbox();
    server.use(
      http.patch("*/api/contact/admin/:id", async ({ params, request }) => {
        patched = { id: params.id as string, body: await request.json() };
        return HttpResponse.json({ data: makeMessageRow({ status: "READ" }) });
      }),
    );
    renderInbox();
    await screen.findByText("Ivan Petrenko");

    await userEvent.click(rowMenu());
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.open }),
    );
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("ORD-10231")).toBeInTheDocument();

    await userEvent.click(
      within(panel).getByRole("button", {
        name: d.statusMenu(d.statusNew),
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.markRead }),
    );

    await waitFor(() => expect(patched.id).toBe("msg-uuid-1"));
    expect(patched.body).toEqual({ status: "READ" });
  });

  it("changes the status straight from «⋯» too", async () => {
    let patched: unknown = null;
    stubInbox();
    server.use(
      http.patch("*/api/contact/admin/:id", async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({
          data: makeMessageRow({ status: "IN_PROGRESS" }),
        });
      }),
    );
    renderInbox();
    await screen.findByText("Ivan Petrenko");

    await userEvent.click(rowMenu());
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.markInProgress }),
    );
    await waitFor(() => expect(patched).toEqual({ status: "IN_PROGRESS" }));
  });

  it("offers «Профіль клієнта» in «⋯» only for a matched sender (TASK-256)", async () => {
    stubInbox([
      makeMessageRow({ matchedUserId: "user-uuid-1" }),
      makeMessageRow({ id: "msg-uuid-2", name: "Olena Koval" }),
    ]);
    renderInbox();
    await screen.findByText("Ivan Petrenko");

    await userEvent.click(rowMenu());
    expect(
      await screen.findByRole("menuitem", { name: d.viewProfile }),
    ).toHaveAttribute("href", "/users/user-uuid-1");
    await userEvent.keyboard("{Escape}");

    await userEvent.click(rowMenu("Olena Koval"));
    await screen.findByRole("menuitem", { name: d.open });
    expect(
      screen.queryByRole("menuitem", { name: d.viewProfile }),
    ).not.toBeInTheDocument();
  });
});

describe("MessageInbox — views (З1, З4)", () => {
  const tab = (name: string) =>
    screen.getByRole("tab", { name: new RegExp(`^${name}`) });

  it("replaces the status select with views, «Усі» active and no status asked", async () => {
    const params = stubInbox();
    renderInbox();
    await screen.findByText("Ivan Petrenko");

    for (const label of [
      d.filterNew,
      d.filterInProgress,
      d.filterRead,
      d.viewArchived,
      d.filterSpam,
      d.filterAll,
    ]) {
      expect(tab(label)).toBeInTheDocument();
    }
    expect(tab(d.filterAll)).toHaveAttribute("aria-selected", "true");
    // «Усі» never asks for SPAM — the API leaves it out (TASK-761).
    expect(params[0].get("status")).toBeNull();
    // The status select is gone — the only combobox left is the page size.
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });

  it.each([
    [d.filterNew, "/messages?status=NEW"],
    [d.filterInProgress, "/messages?status=IN_PROGRESS"],
    [d.filterRead, "/messages?status=READ"],
    [d.viewArchived, "/messages?status=ARCHIVED"],
    [d.filterSpam, "/messages?status=SPAM"],
  ])("«%s» writes the old ?status= (%s)", async (label, url) => {
    stubInbox();
    renderInbox();
    await screen.findByText("Ivan Petrenko");

    await userEvent.click(tab(label));
    expect(mockReplace).toHaveBeenCalledWith(url);
  });

  it("«Усі» drops the status and the page", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "status=NEW&page=2&search=ivan",
    );
    stubInbox();
    renderInbox();
    await screen.findByText("Ivan Petrenko");

    await userEvent.click(tab(d.filterAll));
    expect(mockReplace).toHaveBeenCalledWith("/messages?search=ivan");
  });

  it("highlights the view a deep link stands for", async () => {
    mockSearchParamsRef.current = new URLSearchParams("status=IN_PROGRESS");
    const params = stubInbox([makeMessageRow({ status: "IN_PROGRESS" })]);
    renderInbox();
    await screen.findByText("Ivan Petrenko");

    expect(params[0].get("status")).toBe("IN_PROGRESS");
    expect(tab(d.filterInProgress)).toHaveAttribute("aria-selected", "true");
  });

  it("counts each view from the API's own totals", async () => {
    stubInbox([makeMessageRow()], {
      NEW: 1,
      IN_PROGRESS: 2,
      READ: 3,
      ARCHIVED: 4,
      SPAM: 5,
      "": 10,
    });
    renderInbox();
    await screen.findByText("Ivan Petrenko");

    await waitFor(() => expect(tab(d.filterAll)).toHaveTextContent("10"));
    expect(tab(d.filterNew)).toHaveTextContent("1");
    expect(tab(d.filterInProgress)).toHaveTextContent("2");
    expect(tab(d.filterRead)).toHaveTextContent("3");
    expect(tab(d.viewArchived)).toHaveTextContent("4");
    expect(tab(d.filterSpam)).toHaveTextContent("5");
  });

  it("says how many are found and how many are new", async () => {
    stubInbox([makeMessageRow(), makeMessageRow({ id: "msg-uuid-2" })]);
    renderInbox();
    await screen.findAllByText("Ivan Petrenko");

    // `meta.unread` is the API's own count of NEW messages.
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent ===
            `${d.summaryFound} ${countLabel(2, d.itemForms)} · ${d.summaryNew} 2`,
      ),
    ).toBeInTheDocument();
  });

  // TASK-761: honeypot hits are kept as SPAM rows, visible only on request —
  // and the view says what it is.
  it("asks for SPAM on «Спам», labels the rows and explains the view", async () => {
    mockSearchParamsRef.current = new URLSearchParams("status=SPAM");
    const params = stubInbox([makeMessageRow({ status: "SPAM" })]);
    renderInbox();
    await screen.findByText("Ivan Petrenko");

    expect(params[0].get("status")).toBe("SPAM");
    expect(
      within(screen.getByRole("table")).getByText(d.statusSpam),
    ).toBeInTheDocument();
    expect(screen.getByText(d.spamTitle)).toBeInTheDocument();
    expect(screen.getByText(d.spamText)).toBeInTheDocument();
  });

  it("does not explain spam on the other views", async () => {
    stubInbox();
    renderInbox();
    await screen.findByText("Ivan Petrenko");

    expect(screen.queryByText(d.spamTitle)).not.toBeInTheDocument();
  });

  it("shows the empty text of «Усі»", async () => {
    stubInbox([]);
    renderInbox();
    expect(await screen.findByText(d.empty)).toBeInTheDocument();
  });

  it("shows the empty text of the view", async () => {
    mockSearchParamsRef.current = new URLSearchParams("status=ARCHIVED");
    stubInbox([]);
    renderInbox();
    expect(await screen.findByText(d.emptyArchived)).toBeInTheDocument();
  });
});

describe("MessageInbox — sort and refresh (TASK-354)", () => {
  it("sends the default sort and rewrites the URL when a header is clicked", async () => {
    const params = stubInbox();
    renderInbox();
    await screen.findByText("Ivan Petrenko");

    // The DTO default is sent explicitly, so "no param" and "the default param"
    // are not two cache entries for the same page.
    expect(params[0].get("sortBy")).toBe("createdAt");
    expect(params[0].get("sortOrder")).toBe("desc");
    expect(
      screen.getByText(r.summarySort(d.sortCreatedDesc)),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.sortByAria(d.colName) }),
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("sortBy=name"),
      ),
    );
  });

  it("refetches the inbox when «Оновити» is pressed", async () => {
    const params = stubInbox();
    renderInbox();
    await screen.findByText("Ivan Petrenko");
    expect(params).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );
    await waitFor(() => expect(params).toHaveLength(2));
  });
});

describe("MessageInbox — bulk bar (З2) and TASK-1011", () => {
  it("keeps the idle hint and archives the selection through the batch endpoint", async () => {
    let body: unknown = null;
    stubInbox([
      makeMessageRow(),
      makeMessageRow({ id: "msg-uuid-2", name: "Olena Koval" }),
    ]);
    server.use(
      http.patch("*/api/contact/admin/status", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { updatedCount: 1 } });
      }),
    );
    renderInbox();
    await screen.findByText("Ivan Petrenko");

    expect(screen.getByText(d.bulkIdleHint)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: r.selectRowAria(d.rowAria("Ivan Petrenko")),
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: d.bulk.markArchived(1) }),
    );
    await waitFor(() =>
      expect(body).toEqual({ ids: ["msg-uuid-1"], status: "ARCHIVED" }),
    );
  });

  it("marks the whole page read from the header checkbox", async () => {
    let body: unknown = null;
    stubInbox([
      makeMessageRow(),
      makeMessageRow({ id: "msg-uuid-2", name: "Olena Koval" }),
      makeMessageRow({ id: "msg-uuid-3", name: "Petro Shevchuk" }),
    ]);
    server.use(
      http.patch("*/api/contact/admin/status", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { updatedCount: 3 } });
      }),
    );
    renderInbox();
    await screen.findByText("Ivan Petrenko");

    await userEvent.click(
      screen.getByRole("checkbox", { name: dict.common.table.selectAll }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: d.bulk.markRead(3) }),
    );
    await waitFor(() =>
      expect(body).toEqual({
        ids: ["msg-uuid-1", "msg-uuid-2", "msg-uuid-3"],
        status: "READ",
      }),
    );
  });

  it("offers bulk «В роботу» too", async () => {
    stubInbox();
    renderInbox();
    await screen.findByText("Ivan Petrenko");

    await userEvent.click(
      screen.getByRole("checkbox", {
        name: r.selectRowAria(d.rowAria("Ivan Petrenko")),
      }),
    );
    expect(
      screen.getByRole("button", { name: d.bulk.markInProgress(1) }),
    ).toBeInTheDocument();
  });

  /**
   * TASK-1011 — `messages:write` is what the API checks on every status change
   * and the note; without it the inbox is a read-only list that says so (З7).
   */
  it("is view-only without messages:write: no selection, no status items", async () => {
    stubInbox();
    renderInbox([PERM.messagesRead]);
    await screen.findByText("Ivan Petrenko");

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(d.bulkIdleHint)).not.toBeInTheDocument();
    expect(screen.getByText(d.readOnly)).toBeInTheDocument();

    await userEvent.click(rowMenu());
    await screen.findByRole("menuitem", { name: d.open });
    for (const label of [
      d.markInProgress,
      d.markRead,
      d.markArchived,
      d.markNew,
    ]) {
      expect(
        screen.queryByRole("menuitem", { name: label }),
      ).not.toBeInTheDocument();
    }
  });
});

/** TASK-423 — search over name, email, phone, topic, order ref and text. */
describe("MessageInbox — search and page size (TASK-423)", () => {
  it("debounces the typed term into the URL", async () => {
    stubInbox();
    renderInbox();
    await screen.findByText("Ivan Petrenko");

    await userEvent.type(screen.getByLabelText(d.searchAria), "ORD-10231");

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/messages?search=ORD-10231"),
    );
  });

  it("forwards the term and the shared page size to the API", async () => {
    mockSearchParamsRef.current = new URLSearchParams("search=ivan");
    const params = stubInbox();
    renderInbox();
    await screen.findByText("Ivan Petrenko");

    expect(params[0].get("search")).toBe("ivan");
    expect(params[0].get("limit")).toBe("20");
  });

  it("names the term in the empty state", async () => {
    mockSearchParamsRef.current = new URLSearchParams("search=ghost");
    stubInbox([]);
    renderInbox();

    expect(await screen.findByText(r.noResults("ghost"))).toBeInTheDocument();
  });
});
