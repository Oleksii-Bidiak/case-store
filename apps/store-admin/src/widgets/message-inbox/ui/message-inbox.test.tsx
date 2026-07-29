import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { MessageInbox } from "./message-inbox";

// next/navigation is unavailable under jsdom — mock the router + URL state.
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/messages",
  useSearchParams: () => new URLSearchParams(""),
}));

function makeMessageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-uuid-1",
    name: "Ivan Petrenko",
    phone: "+380671234567",
    email: "ivan@example.com",
    topic: "order",
    orderRef: "ORD-10231",
    message: "Доброго дня! Питання по замовленню.",
    status: "NEW",
    adminNote: null,
    createdAt: "2026-07-05T10:00:00.000Z",
    updatedAt: "2026-07-05T10:00:00.000Z",
    ...overrides,
  };
}

function listResponse(rows: unknown[]) {
  return HttpResponse.json({
    data: rows,
    meta: {
      total: rows.length,
      page: 1,
      limit: 20,
      totalPages: 1,
      unread: rows.length,
    },
  });
}

describe("MessageInbox", () => {
  beforeEach(() => mockReplace.mockClear());

  it("renders sender, topic, snippet, and status for each message", async () => {
    server.use(
      http.get("*/api/contact/admin", () =>
        listResponse([
          makeMessageRow(),
          makeMessageRow({
            id: "msg-uuid-2",
            name: "Olena Koval",
            status: "READ",
            topic: null,
            message: "Дякую за швидку відповідь!",
          }),
        ]),
      ),
    );

    renderWithProviders(<MessageInbox />);

    expect(await screen.findByText("Ivan Petrenko")).toBeInTheDocument();
    expect(screen.getByText("Olena Koval")).toBeInTheDocument();
    expect(
      screen.getByText("Доброго дня! Питання по замовленню."),
    ).toBeInTheDocument();
    // NEW + READ status badges render their localized labels.
    expect(screen.getByText(dict.messages.statusNew)).toBeInTheDocument();
    expect(screen.getByText(dict.messages.statusRead)).toBeInTheDocument();
  });

  it("updates the status URL param when the filter changes", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/api/contact/admin", () => listResponse([makeMessageRow()])),
    );

    renderWithProviders(<MessageInbox />);
    await screen.findByText("Ivan Petrenko");

    await user.click(
      screen.getByRole("combobox", { name: dict.messages.filterStatusAria }),
    );
    await user.click(
      await screen.findByRole("option", { name: dict.messages.filterArchived }),
    );

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("status=ARCHIVED"),
      ),
    );
  });

  it("opens the detail dialog and marks the message read", async () => {
    const user = userEvent.setup();
    let patched: { id?: string; body?: unknown } = {};
    server.use(
      http.get("*/api/contact/admin", () => listResponse([makeMessageRow()])),
      http.get("*/api/contact/admin/unread-count", () =>
        HttpResponse.json({ data: { unread: 1 } }),
      ),
      http.patch("*/api/contact/admin/:id", async ({ params, request }) => {
        patched = { id: params.id as string, body: await request.json() };
        return HttpResponse.json({
          data: makeMessageRow({ status: "READ" }),
        });
      }),
    );

    renderWithProviders(<MessageInbox />);
    await screen.findByText("Ivan Petrenko");

    await user.click(screen.getByRole("button", { name: dict.messages.open }));

    // The dialog shows the full contact details.
    expect(await screen.findByText("+380671234567")).toBeInTheDocument();
    expect(screen.getByText("ORD-10231")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: dict.messages.markRead }),
    );

    await waitFor(() => expect(patched.id).toBe("msg-uuid-1"));
    expect(patched.body).toEqual({ status: "READ" });
  });

  it("saves an admin note through the update mutation", async () => {
    const user = userEvent.setup();
    let patched: unknown = null;
    server.use(
      http.get("*/api/contact/admin", () => listResponse([makeMessageRow()])),
      http.get("*/api/contact/admin/unread-count", () =>
        HttpResponse.json({ data: { unread: 1 } }),
      ),
      http.patch("*/api/contact/admin/:id", async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({
          data: makeMessageRow({ adminNote: "Called back" }),
        });
      }),
    );

    renderWithProviders(<MessageInbox />);
    await screen.findByText("Ivan Petrenko");
    await user.click(screen.getByRole("button", { name: dict.messages.open }));

    const note = await screen.findByLabelText(dict.messages.fieldAdminNote);
    await user.type(note, "Called back");
    await user.click(
      screen.getByRole("button", { name: dict.messages.saveNote }),
    );

    await waitFor(() => expect(patched).toEqual({ adminNote: "Called back" }));
  });

  it("shows the empty state when there are no messages", async () => {
    server.use(http.get("*/api/contact/admin", () => listResponse([])));

    renderWithProviders(<MessageInbox />);

    expect(await screen.findByText(dict.messages.empty)).toBeInTheDocument();
  });

  it("renders in card mode with per-cell labels (TASK-258)", async () => {
    server.use(
      http.get("*/api/contact/admin", () => listResponse([makeMessageRow()])),
    );

    const { container } = renderWithProviders(<MessageInbox />);
    await screen.findByText("Ivan Petrenko");

    expect(container.querySelector('[data-slot="table"]')).toHaveClass(
      "max-md:block",
    );
    expect(
      container.querySelector(`[data-label="${dict.messages.colStatus}"]`),
    ).toBeInTheDocument();
    expect(
      container.querySelector(`[data-label="${dict.common.actions}"]`),
    ).toBeInTheDocument();
  });

  it("offers the IN_PROGRESS filter option and round-trips it through the URL (TASK-256)", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/api/contact/admin", () => listResponse([makeMessageRow()])),
    );

    renderWithProviders(<MessageInbox />);
    await screen.findByText("Ivan Petrenko");

    await user.click(
      screen.getByRole("combobox", { name: dict.messages.filterStatusAria }),
    );
    await user.click(
      await screen.findByRole("option", {
        name: dict.messages.filterInProgress,
      }),
    );

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("status=IN_PROGRESS"),
      ),
    );
  });

  it("renders the IN_PROGRESS status badge label (TASK-256)", async () => {
    server.use(
      http.get("*/api/contact/admin", () =>
        listResponse([makeMessageRow({ status: "IN_PROGRESS" })]),
      ),
    );

    renderWithProviders(<MessageInbox />);

    expect(
      await screen.findByText(dict.messages.statusInProgress),
    ).toBeInTheDocument();
  });

  it("sends the default sort and rewrites the URL when a header is clicked (TASK-354)", async () => {
    const user = userEvent.setup();
    let captured: URLSearchParams | null = null;
    server.use(
      http.get("*/api/contact/admin", ({ request }) => {
        captured = new URL(request.url).searchParams;
        return listResponse([makeMessageRow()]);
      }),
    );

    renderWithProviders(<MessageInbox />);
    await screen.findByText("Ivan Petrenko");

    // The DTO default is sent explicitly, so "no param" and "the default param"
    // are not two cache entries for the same page.
    expect(captured!.get("sortBy")).toBe("createdAt");
    expect(captured!.get("sortOrder")).toBe("desc");

    await user.click(
      screen.getByRole("button", {
        name: dict.common.sortByAria(dict.messages.colName),
      }),
    );

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("sortBy=name"),
      ),
    );
  });

  it("refetches the inbox when Оновити is pressed (TASK-354)", async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.get("*/api/contact/admin", () => {
        calls += 1;
        return listResponse([makeMessageRow()]);
      }),
    );

    renderWithProviders(<MessageInbox />);
    await screen.findByText("Ivan Petrenko");
    expect(calls).toBe(1);

    await user.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() => expect(calls).toBe(2));
  });

  it("bulk-archives the selected messages through the batch endpoint (TASK-354)", async () => {
    const user = userEvent.setup();
    let body: unknown = null;
    server.use(
      http.get("*/api/contact/admin", () =>
        listResponse([
          makeMessageRow(),
          makeMessageRow({ id: "msg-uuid-2", name: "Olena Koval" }),
        ]),
      ),
      http.patch("*/api/contact/admin/status", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { updatedCount: 1 } });
      }),
    );

    renderWithProviders(<MessageInbox />);
    await screen.findByText("Ivan Petrenko");

    // No selection ⇒ no bar at all; its appearance IS the feedback.
    expect(
      screen.queryByText(dict.common.table.selectedCount(1)),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", {
        name: dict.messages.bulk.selectRow("Ivan Petrenko"),
      }),
    );

    await user.click(
      await screen.findByRole("button", {
        name: dict.messages.bulk.markArchived(1),
      }),
    );

    await waitFor(() =>
      expect(body).toEqual({ ids: ["msg-uuid-1"], status: "ARCHIVED" }),
    );
  });

  it("acts only on rows still on the page, and Shift+click sweeps a range (TASK-354)", async () => {
    const user = userEvent.setup();
    let body: unknown = null;
    server.use(
      http.get("*/api/contact/admin", () =>
        listResponse([
          makeMessageRow(),
          makeMessageRow({ id: "msg-uuid-2", name: "Olena Koval" }),
          makeMessageRow({ id: "msg-uuid-3", name: "Petro Shevchuk" }),
        ]),
      ),
      http.patch("*/api/contact/admin/status", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { updatedCount: 3 } });
      }),
    );

    renderWithProviders(<MessageInbox />);
    await screen.findByText("Ivan Petrenko");

    await user.click(
      screen.getByRole("checkbox", {
        name: dict.messages.bulk.selectRow("Ivan Petrenko"),
      }),
    );
    await user.keyboard("{Shift>}");
    await user.click(
      screen.getByRole("checkbox", {
        name: dict.messages.bulk.selectRow("Petro Shevchuk"),
      }),
    );
    await user.keyboard("{/Shift}");

    await user.click(
      await screen.findByRole("button", {
        name: dict.messages.bulk.markRead(3),
      }),
    );

    await waitFor(() =>
      expect(body).toEqual({
        ids: ["msg-uuid-1", "msg-uuid-2", "msg-uuid-3"],
        status: "READ",
      }),
    );
  });

  it("announces the selection into the live region (TASK-354)", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/api/contact/admin", () =>
        listResponse([
          makeMessageRow(),
          makeMessageRow({ id: "msg-uuid-2", name: "Olena Koval" }),
        ]),
      ),
    );

    renderWithProviders(<MessageInbox />);
    await screen.findByText("Ivan Petrenko");

    // Regression guard. `useRowSelection` calls `useAnnouncer()`, so it has to
    // run BELOW the `<LiveAnnouncer>` — a hook called in the same component
    // that renders the provider silently gets the default no-op context, and
    // every announcement disappears with nothing on screen looking wrong.
    await user.click(
      screen.getByRole("checkbox", {
        name: dict.messages.bulk.selectRow("Ivan Petrenko"),
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
        dict.common.table.announceSelected("Ivan Petrenko", 1),
      ),
    );
  });

  it("pins the row checkbox to the card corner instead of stacking it as a labelled field (TASK-354)", async () => {
    server.use(
      http.get("*/api/contact/admin", () => listResponse([makeMessageRow()])),
    );

    const { container } = renderWithProviders(<MessageInbox />);
    await screen.findByText("Ivan Petrenko");

    const cell = container.querySelector('[data-slot="table-select-cell"]');
    // No `data-label` ⇒ no "ВИБІР ☐" caption strip above the sender's name.
    expect(cell).not.toHaveAttribute("data-label");
    expect(cell).toHaveClass("max-md:absolute");
    // …and the control is still named after the record it acts on, so nothing
    // in the card is anonymous once the caption is gone.
    expect(
      screen.getByRole("checkbox", {
        name: dict.messages.bulk.selectRow("Ivan Petrenko"),
      }),
    ).toBeInTheDocument();
  });

  it("links the sender name to the customer profile when matchedUserId is present (TASK-256)", async () => {
    server.use(
      http.get("*/api/contact/admin", () =>
        listResponse([
          makeMessageRow({ matchedUserId: "user-uuid-1" }),
          makeMessageRow({
            id: "msg-uuid-2",
            name: "Olena Koval",
            matchedUserId: null,
          }),
        ]),
      ),
    );

    renderWithProviders(<MessageInbox />);

    // Matched sender → a link to the customer card.
    const link = await screen.findByRole("link", { name: "Ivan Petrenko" });
    expect(link).toHaveAttribute("href", "/users/user-uuid-1");

    // Unmatched sender → plain text, no link.
    expect(screen.getByText("Olena Koval")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Olena Koval" }),
    ).not.toBeInTheDocument();
  });
});
