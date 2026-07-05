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
});
