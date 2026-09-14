import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { orderStatusLabel } from "@/entities/order";
import { UserDetailView } from "./UserDetailView";

// next/navigation is unavailable under jsdom — mock the router.
const replaceMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

// The nested UserBanToggle reads the auth context — stub it so this suite can
// render the widget without an <AuthProvider> (a different admin than the card's
// user, so the real deactivate button renders rather than the self-ban guard).
jest.mock("@/entities/session", () => ({
  useAuth: () => ({
    userId: "admin-1",
    role: "ADMIN",
    email: "admin@example.com",
    accessToken: null,
    isAuthenticated: true,
    isStaff: true,
    // Owner, so the TASK-317 staff-management panel renders.
    isOwner: true,
    isInitializing: false,
    permissions: [],
    arePermissionsLoading: false,
    can: () => true,
    canAll: () => true,
    setTokens: jest.fn(),
    clearTokens: jest.fn(),
  }),
}));

const USER_ID = "user-detail-1";

const baseUser = {
  id: USER_ID,
  email: "customer@test.local",
  firstName: "Olena",
  lastName: "Shevchenko",
  phone: "+380501234567",
  role: "CUSTOMER",
  isActive: true,
  // TASK-430: on the wire since TASK-342. Null here — the unconfirmed case is the
  // one the panel was silent about, so it is the default the suite renders.
  emailVerifiedAt: null as string | null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z",
};

interface CardOverrides {
  ltv?: number;
  orderCount?: number;
  recentOrders?: unknown[];
  reviews?: unknown[];
  redeemedCoupons?: unknown[];
  contactMessages?: unknown[];
}

const FULL_CARD: Required<CardOverrides> = {
  ltv: 1299.5,
  orderCount: 3,
  recentOrders: [
    {
      id: "order-aaaaaaaa",
      status: "DELIVERED",
      paymentStatus: "PAID",
      total: 129.99,
      createdAt: "2026-03-01T10:00:00.000Z",
    },
  ],
  reviews: [
    {
      id: "review-1",
      productId: "prod-1",
      productName: "iPhone 15 Pro Case",
      rating: 5,
      comment: "Чудовий чохол!",
      // TASK-446: `isActive` is gone from CustomerCardReviewEntity. The text now
      // carries a three-value verdict, because REJECTED is a state a review keeps
      // instead of being deleted out of existence.
      textStatus: "APPROVED",
      createdAt: "2026-03-02T10:00:00.000Z",
    },
  ],
  redeemedCoupons: [
    {
      id: "redemption-1",
      code: "SUMMER20",
      type: "PERCENT",
      value: 20,
      orderId: "order-aaaaaaaa",
      redeemedAt: "2026-03-01T10:00:00.000Z",
    },
  ],
  contactMessages: [
    {
      id: "message-1",
      topic: "Питання про доставку",
      message: "Коли приїде замовлення?",
      status: "NEW",
      createdAt: "2026-03-03T10:00:00.000Z",
    },
  ],
};

function mockCard(overrides: CardOverrides = {}) {
  const card = { user: baseUser, ...FULL_CARD, ...overrides };
  server.use(
    http.get("*/api/users/:id/admin-card", () =>
      HttpResponse.json({ data: card }),
    ),
  );
}

function mockCardStatus(status: number) {
  server.use(
    http.get("*/api/users/:id/admin-card", () =>
      HttpResponse.json({ message: "err" }, { status }),
    ),
  );
}

/**
 * The notes journal (TASK-430). The card renders it on every load, and MSW runs
 * with `onUnhandledRequest: "error"`, so a default stub belongs here rather than in
 * the shared handlers — this is the only widget that reads it, and the shared file
 * is one more place three parallel waves would collide.
 *
 * Registered per test in `beforeEach`, and a later `server.use` in a test wins (MSW
 * matches the most recently added handler first).
 */
function mockNotes(notes: unknown[] = [], total = notes.length) {
  server.use(
    http.get("*/api/admin/users/:userId/notes", () =>
      HttpResponse.json({ data: notes, meta: { total, limit: 50 } }),
    ),
  );
}

function makeNote(overrides: Record<string, unknown> = {}) {
  return {
    id: "note-1",
    userId: USER_ID,
    authorId: "manager-1",
    authorEmail: "manager@example.com",
    body: "Просив передзвонити після 18:00.",
    createdAt: "2026-09-13T07:24:00.000Z",
    ...overrides,
  };
}

describe("UserDetailView (customer card, TASK-252)", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    mockNotes();
  });

  it("renders the profile section from the enriched card shape", async () => {
    mockCard();

    renderWithProviders(<UserDetailView userId={USER_ID} />);

    // Email appears in the heading + profile field once the fetch resolves.
    expect(await screen.findAllByText("customer@test.local")).not.toHaveLength(
      0,
    );
    // Name appears twice (avatar heading + full-name field).
    expect(screen.getAllByText("Olena Shevchenko")).not.toHaveLength(0);
    // Ban toggle (from the profile section) renders.
    expect(
      screen.getByRole("button", { name: dict.userBan.deactivateUserAria }),
    ).toBeInTheDocument();
  });

  it("renders the lifetime stat row (LTV + order count)", async () => {
    mockCard();

    renderWithProviders(<UserDetailView userId={USER_ID} />);

    expect(await screen.findByText(dict.users.cardLtv)).toBeInTheDocument();
    expect(screen.getByText(dict.users.cardOrderCount)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders recent orders with a status badge and view-all link", async () => {
    mockCard();

    renderWithProviders(<UserDetailView userId={USER_ID} />);

    expect(
      await screen.findByText(dict.users.cardRecentOrders),
    ).toBeInTheDocument();
    expect(screen.getByText(orderStatusLabel("DELIVERED"))).toBeInTheDocument();
    // Row action links to the order detail.
    const viewLink = screen.getByRole("link", { name: dict.common.view });
    expect(viewLink).toHaveAttribute("href", "/orders/order-aaaaaaaa");
    // Header "view all" deep link into the filtered order list.
    const viewAll = screen.getByRole("link", {
      name: dict.users.cardViewAllOrders,
    });
    expect(viewAll).toHaveAttribute("href", `/orders?userId=${USER_ID}`);
  });

  it("renders reviews, coupons, and contact messages", async () => {
    mockCard();

    renderWithProviders(<UserDetailView userId={USER_ID} />);

    expect(await screen.findByText("iPhone 15 Pro Case")).toBeInTheDocument();
    expect(screen.getByText(dict.users.cardReviewApproved)).toBeInTheDocument();
    expect(screen.getByText("SUMMER20")).toBeInTheDocument();
    expect(screen.getByText("Питання про доставку")).toBeInTheDocument();
    expect(screen.getByText(dict.messages.statusNew)).toBeInTheDocument();
  });

  /**
   * TASK-446 — the badge was driven by `isActive`, a field the backend dropped.
   * It read `undefined` as «На модерації», so an approved review and a rejected
   * one both showed as pending: the card could not tell «ще не читали» from
   * «прочитали й відхилили», which is the exact distinction the three-value
   * `textStatus` exists to make.
   */
  it.each([
    ["PENDING", () => dict.users.cardReviewPending],
    ["APPROVED", () => dict.users.cardReviewApproved],
    ["REJECTED", () => dict.users.cardReviewRejected],
  ])("labels a %s review text from textStatus", async (textStatus, label) => {
    mockCard({
      reviews: [
        {
          id: "review-1",
          productId: "prod-1",
          productName: "iPhone 15 Pro Case",
          rating: 5,
          comment: "Чудовий чохол!",
          textStatus,
          createdAt: "2026-03-02T10:00:00.000Z",
        },
      ],
    });

    renderWithProviders(<UserDetailView userId={USER_ID} />);

    await screen.findByText("iPhone 15 Pro Case");
    expect(screen.getByText(label())).toBeInTheDocument();
  });

  it("renders the IN_PROGRESS contact-message status label, not the raw enum (TASK-256)", async () => {
    mockCard({
      contactMessages: [
        {
          id: "message-2",
          topic: "Питання про повернення",
          message: "Як оформити повернення?",
          status: "IN_PROGRESS",
          createdAt: "2026-03-04T10:00:00.000Z",
        },
      ],
    });

    renderWithProviders(<UserDetailView userId={USER_ID} />);

    expect(
      await screen.findByText("Питання про повернення"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.messages.statusInProgress),
    ).toBeInTheDocument();
    expect(screen.queryByText("IN_PROGRESS")).not.toBeInTheDocument();
  });

  it("shows every empty-state copy when the sub-lists are empty", async () => {
    mockCard({
      recentOrders: [],
      reviews: [],
      redeemedCoupons: [],
      contactMessages: [],
    });

    renderWithProviders(<UserDetailView userId={USER_ID} />);

    expect(
      await screen.findByText(dict.users.cardNoOrders),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.users.cardNoReviews)).toBeInTheDocument();
    expect(screen.getByText(dict.users.cardNoCoupons)).toBeInTheDocument();
    expect(screen.getByText(dict.users.cardNoMessages)).toBeInTheDocument();
  });

  it("redirects to the list on a 404", async () => {
    mockCardStatus(404);

    renderWithProviders(<UserDetailView userId={USER_ID} />);

    // The 404 effect replaces to the list route.
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/users"));
  });

  it("shows the error copy on a non-404 failure", async () => {
    mockCardStatus(500);

    renderWithProviders(<UserDetailView userId={USER_ID} />);

    expect(
      await screen.findByText(dict.users.loadOneError),
    ).toBeInTheDocument();
  });

  // SF-AUTH-14 / TASK-406 — the ban toggle invalidated `findAll` and `findById`,
  // neither of which this screen reads. It renders `useGetUserAdminCard`, so the
  // status line and the button label kept claiming the account was active after
  // a successful deactivation, and the operator had no way to tell it worked.
  it("re-reads the card after a deactivation so the status flips on screen", async () => {
    const state = { isActive: true };
    server.use(
      http.get("*/api/users/:id/admin-card", () =>
        HttpResponse.json({
          data: {
            user: { ...baseUser, isActive: state.isActive },
            ...FULL_CARD,
          },
        }),
      ),
      http.patch("*/api/users/:id/deactivate", () => {
        state.isActive = false;
        return HttpResponse.json({ data: { ...baseUser, isActive: false } });
      }),
    );

    renderWithProviders(<UserDetailView userId={USER_ID} />);
    expect(
      await screen.findByText(dict.users.accountActive),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: dict.userBan.deactivateUserAria }),
    );

    expect(
      await screen.findByText(dict.users.accountInactive),
    ).toBeInTheDocument();
    // …and the control now offers the way back, rather than a second «Деактивувати».
    expect(
      await screen.findByRole("button", {
        name: dict.userBan.activateUserAria,
      }),
    ).toBeInTheDocument();
  });

  // TASK-475: the «Права видаються ролі…» hint and its link to the role matrix
  // were removed here, because the matrix screen is gone and the sentence is no
  // longer true — rights belong to the person now. This asserts the ABSENCE
  // rather than deleting the case outright: a dangling link to a deleted route
  // is a 404 the owner finds by clicking, and the per-person «Права» tab that
  // replaces it lands with /staff (TASK-480).
  it("no longer points the owner at a role-permissions screen that does not exist", async () => {
    mockCard();

    renderWithProviders(<UserDetailView userId={USER_ID} />);

    // The owner panel itself is still here…
    expect(
      await screen.findByText(dict.users.staffHeading),
    ).toBeInTheDocument();
    // …and it offers no route to the retired matrix.
    expect(
      screen.queryByRole("link", { name: /права/i }),
    ).not.toBeInTheDocument();
    for (const link of screen.queryAllByRole("link")) {
      expect(link).not.toHaveAttribute("href", "/settings/permissions");
    }
  });

  // ─── Email confirmation (TASK-430 / AD-CRM-04) ────────────────────────────

  describe("email confirmation badge", () => {
    it("says the address is unconfirmed, and why that may be innocent", async () => {
      mockCard();

      renderWithProviders(<UserDetailView userId={USER_ID} />);

      expect(
        await screen.findByText(dict.users.emailNotVerified),
      ).toBeInTheDocument();
      // The hint matters as much as the badge: every account created before
      // verification existed is null too, so this means "we do not know", not
      // "they refused".
      expect(
        screen.getByText(dict.users.emailNotVerifiedHint),
      ).toBeInTheDocument();
    });

    it("shows WHEN the address was confirmed, not just that it was", async () => {
      mockCard({});
      server.use(
        http.get("*/api/users/:id/admin-card", () =>
          HttpResponse.json({
            data: {
              user: {
                ...baseUser,
                emailVerifiedAt: "2026-05-04T09:00:00.000Z",
              },
              ...FULL_CARD,
            },
          }),
        ),
      );

      renderWithProviders(<UserDetailView userId={USER_ID} />);

      expect(
        await screen.findByText(dict.users.emailVerified),
      ).toBeInTheDocument();
      expect(
        screen.getByText(dict.users.emailVerifiedAt("04.05.2026")),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(dict.users.emailNotVerified),
      ).not.toBeInTheDocument();
    });
  });

  // ─── Customer notes (TASK-430) ────────────────────────────────────────────

  describe("staff notes journal", () => {
    it("renders each entry as date · author · text", async () => {
      mockCard();
      mockNotes([makeNote()]);

      renderWithProviders(<UserDetailView userId={USER_ID} />);

      expect(
        await screen.findByText("Просив передзвонити після 18:00."),
      ).toBeInTheDocument();
      expect(screen.getByText("manager@example.com")).toBeInTheDocument();
      // Kyiv time, uk-UA — 07:24 UTC is 10:24 local.
      expect(screen.getByText("13.09.2026, 10:24")).toBeInTheDocument();
    });

    it("names an author whose account is gone instead of rendering a blank", async () => {
      // `UserNote.authorId` carries no foreign key precisely so the note survives
      // the author's deletion; the row must still read as something.
      mockCard();
      mockNotes([makeNote({ authorId: null, authorEmail: null })]);

      renderWithProviders(<UserDetailView userId={USER_ID} />);

      expect(
        await screen.findByText(dict.users.notesAuthorUnknown),
      ).toBeInTheDocument();
    });

    it("appends a note and clears the box only after the POST succeeds", async () => {
      mockCard();
      mockNotes();
      const posted: unknown[] = [];
      server.use(
        http.post("*/api/admin/users/:userId/notes", async ({ request }) => {
          posted.push(await request.json());
          return HttpResponse.json({ data: makeNote() }, { status: 201 });
        }),
      );

      renderWithProviders(<UserDetailView userId={USER_ID} />);

      const box = await screen.findByLabelText(dict.users.notesAddLabel);
      await userEvent.type(box, "  Передзвонити  ");
      await userEvent.click(
        screen.getByRole("button", { name: dict.users.notesAddSubmit }),
      );

      // Trimmed on the way out — a body of spaces is not a journal entry.
      await waitFor(() => expect(posted).toEqual([{ body: "Передзвонити" }]));
      await waitFor(() => expect(box).toHaveValue(""));
    });

    it("keeps the typed text when the POST fails", async () => {
      mockCard();
      mockNotes();
      server.use(
        http.post("*/api/admin/users/:userId/notes", () =>
          HttpResponse.json({ message: "boom" }, { status: 500 }),
        ),
      );

      renderWithProviders(<UserDetailView userId={USER_ID} />);

      const box = await screen.findByLabelText(dict.users.notesAddLabel);
      await userEvent.type(box, "Важлива нотатка");
      await userEvent.click(
        screen.getByRole("button", { name: dict.users.notesAddSubmit }),
      );

      // Losing what the operator just typed is the worst possible response to a
      // failed write.
      await waitFor(() => expect(box).toHaveValue("Важлива нотатка"));
    });

    it("refuses to submit an empty note without asking the server", async () => {
      mockCard();
      mockNotes();

      renderWithProviders(<UserDetailView userId={USER_ID} />);
      await screen.findByLabelText(dict.users.notesAddLabel);

      expect(
        screen.getByRole("button", { name: dict.users.notesAddSubmit }),
      ).toBeDisabled();
    });

    it("says the journal is truncated rather than hiding older entries", async () => {
      mockCard();
      mockNotes([makeNote()], 128);

      renderWithProviders(<UserDetailView userId={USER_ID} />);

      expect(
        await screen.findByText(dict.users.notesTruncated(1, 128)),
      ).toBeInTheDocument();
    });

    it("shows the empty state when there are no notes", async () => {
      mockCard();
      mockNotes([]);

      renderWithProviders(<UserDetailView userId={USER_ID} />);

      expect(
        await screen.findByText(dict.users.notesEmpty),
      ).toBeInTheDocument();
    });
  });
});
