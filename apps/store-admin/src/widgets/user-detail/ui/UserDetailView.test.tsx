import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
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
    accessToken: null,
    isAuthenticated: true,
    isAdmin: true,
    isInitializing: false,
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
      isActive: true,
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

describe("UserDetailView (customer card, TASK-252)", () => {
  beforeEach(() => {
    replaceMock.mockClear();
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
});
