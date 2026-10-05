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
import { dict } from "@/shared/config";
import type { ContactMessageEntity } from "@/entities/contact";
import { MessageDetailSheet } from "./message-detail-sheet";

const d = dict.messages;

function makeMessage(
  overrides: Partial<ContactMessageEntity> = {},
): ContactMessageEntity {
  return {
    id: "msg-uuid-1",
    name: "Ivan Petrenko",
    phone: "+380671234567",
    email: "ivan@example.com",
    topic: "warranty",
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

function renderSheet(
  message: ContactMessageEntity,
  permissions: string[] = [PERM.messagesRead, PERM.messagesWrite],
  onOpenChange: (open: boolean) => void = jest.fn(),
) {
  return renderWithProviders(
    <WithAuth permissions={permissions}>
      <MessageDetailSheet message={message} open onOpenChange={onOpenChange} />
    </WithAuth>,
  );
}

const STATUS_ITEMS = [
  d.markInProgress,
  d.markRead,
  d.markArchived,
  d.markNew,
] as const;

const statusLabelOf: Record<string, string> = {
  NEW: d.statusNew,
  IN_PROGRESS: d.statusInProgress,
  READ: d.statusRead,
  ARCHIVED: d.statusArchived,
  SPAM: d.statusSpam,
};

async function openStatusMenu(status: string) {
  await userEvent.click(
    screen.getByRole("button", { name: d.statusMenu(statusLabelOf[status]) }),
  );
}

describe("MessageDetailSheet — the panel (MessagesProposal З5)", () => {
  it("heads with the topic and status, the sender's contacts as links, and the source", () => {
    renderSheet(makeMessage());

    const panel = screen.getByRole("dialog");
    expect(
      within(panel).getByRole("heading", { name: new RegExp(d.topicWarranty) }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("link", { name: "+380 67 123 4567" }),
    ).toHaveAttribute("href", "tel:+380671234567");
    expect(
      within(panel).getByRole("link", { name: "ivan@example.com" }),
    ).toHaveAttribute("href", "mailto:ivan@example.com");
    expect(within(panel).getByText(d.sourceForm)).toBeInTheDocument();
    expect(
      within(panel).getByText("Доброго дня! Питання по замовленню."),
    ).toBeInTheDocument();
    expect(within(panel).getByText("ORD-10231")).toBeInTheDocument();
  });

  it("links an order number the panel can resolve", () => {
    renderSheet(makeMessage({ orderRef: "#7c1e9a42" }), [
      PERM.messagesRead,
      PERM.ordersRead,
    ]);

    expect(
      screen.getByRole("link", { name: d.orderLinkAria("#7C1E9A42") }),
    ).toHaveAttribute("href", "/orders?search=7C1E9A42");
  });
});

describe("MessageDetailSheet — status menu (was four buttons)", () => {
  const cases: Array<[string, string]> = [
    ["NEW", d.markNew],
    ["IN_PROGRESS", d.markInProgress],
    ["READ", d.markRead],
    ["ARCHIVED", d.markArchived],
  ];

  it.each(cases)(
    "for a %s message hides its own action and offers the other three",
    async (status, hiddenLabel) => {
      renderSheet(makeMessage({ status } as Partial<ContactMessageEntity>));

      await openStatusMenu(status);
      await screen.findByRole("menu");
      expect(
        screen.queryByRole("menuitem", { name: hiddenLabel }),
      ).not.toBeInTheDocument();
      for (const label of STATUS_ITEMS.filter((l) => l !== hiddenLabel)) {
        expect(
          screen.getByRole("menuitem", { name: label }),
        ).toBeInTheDocument();
      }
    },
  );

  // TASK-761: a false positive is put back with «Повернути в нові».
  it("offers «Повернути в нові» on a spam message", async () => {
    renderSheet(
      makeMessage({ status: "SPAM" } as Partial<ContactMessageEntity>),
    );

    await openStatusMenu("SPAM");
    expect(
      await screen.findByRole("menuitem", { name: d.markNew }),
    ).toBeInTheDocument();
  });

  it("PATCHes { status: IN_PROGRESS } for «Взяти в роботу» and closes (TASK-256)", async () => {
    let patched: { id?: string; body?: unknown } = {};
    const onOpenChange = jest.fn();
    server.use(
      http.patch("*/api/contact/admin/:id", async ({ params, request }) => {
        patched = { id: params.id as string, body: await request.json() };
        return HttpResponse.json({
          data: makeMessage({ status: "IN_PROGRESS" }),
        });
      }),
    );
    renderSheet(makeMessage(), undefined, onOpenChange);

    await openStatusMenu("NEW");
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.markInProgress }),
    );

    await waitFor(() => expect(patched.id).toBe("msg-uuid-1"));
    expect(patched.body).toEqual({ status: "IN_PROGRESS" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

describe("MessageDetailSheet — internal note", () => {
  it("saves the note through the update mutation", async () => {
    let patched: unknown = null;
    server.use(
      http.patch("*/api/contact/admin/:id", async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({
          data: makeMessage({ adminNote: "Called back" }),
        });
      }),
    );
    renderSheet(makeMessage());

    const note = screen.getByLabelText(d.fieldAdminNote);
    expect(note).toHaveAccessibleDescription(d.noteHint);
    await userEvent.type(note, "Called back");
    await userEvent.click(screen.getByRole("button", { name: d.saveNote }));

    await waitFor(() => expect(patched).toEqual({ adminNote: "Called back" }));
  });

  it("opens the saved note for editing", () => {
    renderSheet(makeMessage({ adminNote: "Передзвонити після 15:00" }));

    expect(screen.getByLabelText(d.fieldAdminNote)).toHaveValue(
      "Передзвонити після 15:00",
    );
  });
});

/** TASK-1011 / З8 — without `messages:write` the panel is for reading. */
describe("MessageDetailSheet — view only", () => {
  it("has no status menu and no note editor, says why, and shows the saved note", () => {
    renderSheet(makeMessage({ adminNote: "Передзвонити після 15:00" }), [
      PERM.messagesRead,
    ]);

    expect(
      screen.queryByRole("button", { name: d.statusMenu(d.statusNew) }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: d.saveNote }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(d.readOnly)).toBeInTheDocument();
    expect(screen.getByText("Передзвонити після 15:00")).toBeInTheDocument();
    expect(
      screen.getByText(d.noteHidden, { exact: false }),
    ).toBeInTheDocument();
  });
});

describe("MessageDetailSheet — customer profile link (TASK-256)", () => {
  it("links to /users/{matchedUserId} when the sender matches a registered user", () => {
    renderSheet(makeMessage({ matchedUserId: "user-uuid-1" }));

    expect(screen.getByRole("link", { name: d.viewProfile })).toHaveAttribute(
      "href",
      "/users/user-uuid-1",
    );
  });

  it("renders no profile link when matchedUserId is null", () => {
    renderSheet(makeMessage({ matchedUserId: null }));

    expect(
      screen.queryByRole("link", { name: d.viewProfile }),
    ).not.toBeInTheDocument();
  });
});
