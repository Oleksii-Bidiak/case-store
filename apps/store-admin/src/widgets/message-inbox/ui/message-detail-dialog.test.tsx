import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { ContactMessageEntity } from "@/entities/contact";
import { MessageDetailDialog } from "./message-detail-dialog";

function makeMessage(
  overrides: Partial<ContactMessageEntity> = {},
): ContactMessageEntity {
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
    matchedUserId: null,
    createdAt: "2026-07-05T10:00:00.000Z",
    updatedAt: "2026-07-05T10:00:00.000Z",
    ...overrides,
  } as ContactMessageEntity;
}

function renderDialog(message: ContactMessageEntity) {
  return renderWithProviders(
    <MessageDetailDialog message={message} open onOpenChange={jest.fn()} />,
  );
}

const STATUS_BUTTONS = [
  dict.messages.markInProgress,
  dict.messages.markRead,
  dict.messages.markArchived,
  dict.messages.markNew,
] as const;

describe("MessageDetailDialog — status action buttons", () => {
  // Each status hides exactly its own button and shows the other three.
  const cases: Array<[string, string]> = [
    ["NEW", dict.messages.markNew],
    ["IN_PROGRESS", dict.messages.markInProgress],
    ["READ", dict.messages.markRead],
    ["ARCHIVED", dict.messages.markArchived],
  ];

  it.each(cases)(
    "for a %s message hides its own action and shows the other three",
    (status, hiddenLabel) => {
      renderDialog(makeMessage({ status } as Partial<ContactMessageEntity>));

      expect(
        screen.queryByRole("button", { name: hiddenLabel }),
      ).not.toBeInTheDocument();
      for (const label of STATUS_BUTTONS.filter((l) => l !== hiddenLabel)) {
        expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
      }
    },
  );

  it("PATCHes { status: IN_PROGRESS } when «Взяти в роботу» is clicked (TASK-256)", async () => {
    const user = userEvent.setup();
    let patched: { id?: string; body?: unknown } = {};
    server.use(
      http.patch("*/api/contact/admin/:id", async ({ params, request }) => {
        patched = { id: params.id as string, body: await request.json() };
        return HttpResponse.json({
          data: makeMessage({ status: "IN_PROGRESS" }),
        });
      }),
    );

    renderDialog(makeMessage());

    await user.click(
      screen.getByRole("button", { name: dict.messages.markInProgress }),
    );

    await waitFor(() => expect(patched.id).toBe("msg-uuid-1"));
    expect(patched.body).toEqual({ status: "IN_PROGRESS" });
  });

  it("saves the admin note through the update mutation", async () => {
    const user = userEvent.setup();
    let patched: unknown = null;
    server.use(
      http.patch("*/api/contact/admin/:id", async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({
          data: makeMessage({ adminNote: "Called back" }),
        });
      }),
    );

    renderDialog(makeMessage());

    const note = await screen.findByLabelText(dict.messages.fieldAdminNote);
    await user.type(note, "Called back");
    await user.click(
      screen.getByRole("button", { name: dict.messages.saveNote }),
    );

    await waitFor(() => expect(patched).toEqual({ adminNote: "Called back" }));
  });
});

describe("MessageDetailDialog — customer profile link (TASK-256)", () => {
  it("links to /users/{matchedUserId} when the sender matches a registered user", () => {
    renderDialog(makeMessage({ matchedUserId: "user-uuid-1" }));

    const link = screen.getByRole("link", {
      name: dict.messages.viewProfile,
    });
    expect(link).toHaveAttribute("href", "/users/user-uuid-1");
  });

  it("renders no profile link when matchedUserId is null", () => {
    renderDialog(makeMessage({ matchedUserId: null }));

    expect(
      screen.queryByRole("link", { name: dict.messages.viewProfile }),
    ).not.toBeInTheDocument();
  });
});
