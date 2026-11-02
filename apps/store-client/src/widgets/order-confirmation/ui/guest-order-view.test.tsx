import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import {
  makeOrder,
  makeOrderItem,
  makeReturn,
} from "@/shared/test/msw-handlers";
import type { ReturnEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";
import { Toaster } from "@/shared/ui";
import { GuestOrderView } from "./guest-order-view";

// The query string the page is opened with — `?placed=1` right after checkout
// (TASK-1999), nothing when the guest follows the e-mailed link.
let mockSearch = "";
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush }),
  useSearchParams: () => new URLSearchParams(mockSearch),
  usePathname: () => "/orders/guest/token-1",
}));

afterEach(() => {
  mockSearch = "";
});

/**
 * TASK-338. Without this page a guest goes blind the moment their cart cookie
 * expires or they open the confirmation email on another device — they would
 * have paid us and have no way to see what they bought (edge case E-17).
 */
describe("GuestOrderView", () => {
  const guestOrder = makeOrder({
    userId: null,
    guest: {
      email: "olena@example.com",
      phone: "+380501234567",
      name: "Олена Шевченко",
    },
  });

  it("renders the order for a valid token, with no session at all", async () => {
    server.use(
      http.get("*/api/orders/guest/:token", () =>
        HttpResponse.json(guestOrder),
      ),
    );

    // Default render options mean an unauthenticated visitor — the point being
    // that nothing here demands a login.
    renderWithProviders(<GuestOrderView token="token-1" />);

    expect(
      await screen.findByRole("heading", { name: dict.order.thankYou }),
    ).toBeInTheDocument();
    expect(screen.getByText("Відділення №1")).toBeInTheDocument();
    expect(screen.getByText("Олена Шевченко")).toBeInTheDocument();
    expect(screen.getByText("olena@example.com")).toBeInTheDocument();
    // The guest contact phone (and the delivery recipient's), in the UA mask.
    expect(screen.getAllByText("+380 50 123 4567").length).toBeGreaterThan(0);
  });

  // OrderConfirmation.dc.html #pickup: the counter needs to know who collects.
  it("pickup — names who collects the order and their phone", async () => {
    server.use(
      http.get("*/api/orders/guest/:token", () =>
        HttpResponse.json(
          makeOrder({
            userId: null,
            deliveryMethod: "PICKUP",
            shippingCost: "0.00",
            shippingAddress: {
              firstName: "Олена",
              lastName: "Коваль",
              phone: "380501234567",
              city: "Київ",
              address1: "вул. Хрещатик, 22",
              pickupPointName: "Магазин на Хрещатику",
              pickupPointAddress: "вул. Хрещатик, 22",
            },
          }),
        ),
      ),
    );

    renderWithProviders(<GuestOrderView token="token-1" />);

    const block = within(await screen.findByTestId("order-delivery"));
    expect(block.getByText("Олена Коваль")).toBeInTheDocument();
    expect(block.getByText("Київ, вул. Хрещатик, 22")).toBeInTheDocument();
    expect(block.getByText("+380 50 123 4567")).toBeInTheDocument();
  });

  // TASK-647: the same «Доставка» block as the confirmation page.
  it("names the delivery method and an unpriced delivery honestly", async () => {
    server.use(
      http.get("*/api/orders/guest/:token", () =>
        HttpResponse.json(
          makeOrder({
            userId: null,
            deliveryMethod: "OTHER",
            shippingCost: "0.00",
            shippingAddress: {
              firstName: "Олена",
              lastName: "Шевченко",
              city: "Ужгород",
              address1: "Укрпошта, індекс 88000",
              shippingCostPending: true,
            },
          }),
        ),
      ),
    );

    renderWithProviders(<GuestOrderView token="token-1" />);

    expect(
      await screen.findByText(dict.order.deliveryBlock.methods.OTHER),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.order.deliveryBlock.otherNote),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.order.shippingPending)).toBeInTheDocument();
    expect(screen.queryByText(dict.order.shippingFree)).toBeNull();
  });

  it("shows the real payment status rather than assuming anything", async () => {
    server.use(
      http.get("*/api/orders/guest/:token", () =>
        HttpResponse.json(
          makeOrder({ userId: null, paymentStatus: "PENDING" }),
        ),
      ),
    );

    renderWithProviders(<GuestOrderView token="token-1" />);

    expect(
      await screen.findByText("Оплата: Очікує оплати"),
    ).toBeInTheDocument();
  });

  it("gives one indistinguishable message for a bad or expired link", async () => {
    // The API answers 404 for both cases on purpose, so a guesser learns nothing
    // from the response. This view must not undo that by explaining which it was.
    server.use(
      http.get("*/api/orders/guest/:token", () =>
        HttpResponse.json({ message: "Not found" }, { status: 404 }),
      ),
    );

    renderWithProviders(<GuestOrderView token="bad-token" />);

    expect(
      await screen.findByRole("heading", {
        name: dict.order.guest.linkInvalidHeading,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.order.guest.linkInvalidBody),
    ).toBeInTheDocument();
  });
});

/**
 * TASK-1999 — after checkout a guest is sent here (`?placed=1`) instead of a
 * thinner in-place panel, so this page has to say what that panel said: the
 * order is in, an account would keep it, and where to look it up later.
 */
describe("GuestOrderView — arriving from checkout (TASK-1999)", () => {
  const guestOrder = makeOrder({
    userId: null,
    guest: {
      email: "olena@example.com",
      phone: "+380501234567",
      name: "Олена Шевченко",
    },
  });

  function serveOrder() {
    server.use(
      http.get("*/api/orders/guest/:token", () =>
        HttpResponse.json(guestOrder),
      ),
    );
  }

  it("greets the guest with «Замовлення прийнято!» right after checkout", async () => {
    mockSearch = "placed=1";
    serveOrder();

    renderWithProviders(<GuestOrderView token="token-1" />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: dict.checkout.guest.successHeading,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: dict.order.thankYou }),
    ).toBeNull();
  });

  it("keeps the usual heading for a visit from the e-mailed link", async () => {
    serveOrder();

    renderWithProviders(<GuestOrderView token="token-1" />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: dict.order.thankYou,
      }),
    ).toBeInTheDocument();
  });

  it("puts the one-click account at the top, before the order itself (TASK-2010)", async () => {
    mockSearch = "placed=1";
    serveOrder();

    renderWithProviders(<GuestOrderView token="token-1" />);

    const create = await screen.findByRole("button", {
      name: dict.order.guest.oneClickCta("olena@example.com"),
    });
    // Above the order: the first thing read after the heading, not a card at
    // the bottom of the sidebar.
    const items = screen.getByRole("heading", {
      name: dict.order.itemsOrdered,
    });
    expect(
      create.compareDocumentPosition(items) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The bare /register is gone.
    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("href") === "/register"),
    ).toHaveLength(0);
  });

  it("one click creates the account from the token and opens the order in the cabinet", async () => {
    serveOrder();
    const tokens: string[] = [];
    server.use(
      http.post("*/api/orders/guest/:token/account", ({ params }) => {
        tokens.push(String(params.token));
        return HttpResponse.json(
          { data: { accessToken: "new.session.token" } },
          { status: 201 },
        );
      }),
    );
    const setTokens = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<GuestOrderView token="token-1" />, {
      auth: { setTokens },
    });

    await user.click(
      await screen.findByRole("button", {
        name: dict.order.guest.oneClickCta("olena@example.com"),
      }),
    );

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        `/account/orders/${guestOrder.data.id}`,
      ),
    );
    expect(tokens).toEqual(["token-1"]);
    expect(setTokens).toHaveBeenCalledWith("new.session.token");
  });

  it("on 409 says the address has an account and signs in back to this page", async () => {
    serveOrder();
    server.use(
      http.post("*/api/orders/guest/:token/account", () =>
        HttpResponse.json(
          { statusCode: 409, error: "ACCOUNT_EXISTS", message: "exists" },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<GuestOrderView token="token-1" />);

    await user.click(
      await screen.findByRole("button", {
        name: dict.order.guest.oneClickCta("olena@example.com"),
      }),
    );

    expect(
      await screen.findByText(dict.order.guest.oneClickExists),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.order.guest.oneClickSignIn }),
    ).toHaveAttribute(
      "href",
      `/login?redirect=${encodeURIComponent("/orders/guest/token-1")}`,
    );
  });

  it("offers no account for an order an account already holds", async () => {
    server.use(
      http.get("*/api/orders/guest/:token", () =>
        HttpResponse.json({
          ...guestOrder,
          data: { ...guestOrder.data, userId: "user-1" },
        }),
      ),
    );

    renderWithProviders(<GuestOrderView token="token-1" />);

    await screen.findByRole("heading", {
      level: 1,
      name: dict.order.thankYou,
    });
    expect(
      screen.queryByRole("button", {
        name: dict.order.guest.oneClickCta("olena@example.com"),
      }),
    ).toBeNull();
  });

  it("offers no registration to a visitor who is already signed in", async () => {
    serveOrder();

    renderWithProviders(<GuestOrderView token="token-1" />, {
      auth: { isAuthenticated: true, accessToken: "token" },
    });

    await screen.findByRole("heading", {
      level: 1,
      name: dict.order.thankYou,
    });
    expect(
      screen.queryByRole("button", {
        name: dict.order.guest.oneClickCta("olena@example.com"),
      }),
    ).toBeNull();
  });

  it("points to the order-status lookup by number", async () => {
    serveOrder();

    renderWithProviders(<GuestOrderView token="token-1" />);

    expect(
      await screen.findByRole("link", { name: dict.orderLookup.entryLink }),
    ).toHaveAttribute("href", "/orders/status");
  });

  it("still offers Telegram for this order right after checkout (TASK-679)", async () => {
    mockSearch = "placed=1";
    serveOrder();
    server.use(
      http.get("*/api/orders/guest/:token/notifications/telegram", () =>
        HttpResponse.json({
          data: {
            available: true,
            connected: false,
            botUsername: "casestore_bot",
          },
        }),
      ),
    );

    renderWithProviders(<GuestOrderView token="token-1" />);

    expect(
      await screen.findByRole("heading", {
        name: dict.telegramNotifications.guest.heading,
      }),
    ).toBeInTheDocument();
  });
});

/**
 * TASK-1965 (B-12, тема 1.8) — a guest or a phone shopper files a return by the
 * e-mailed link with the same dialog as the account, sees what became of every
 * request, and has the shop's contacts at hand. A bad or expired link still
 * looks exactly like any other (D43).
 */
describe("GuestOrderView — returns (TASK-1965)", () => {
  const delivered = makeOrder({
    userId: null,
    status: "DELIVERED",
    items: [makeOrderItem({ id: "line-1", productName: "Чохол", quantity: 2 })],
  });

  function serveOrder(order = delivered) {
    server.use(
      http.get("*/api/orders/guest/:token", () => HttpResponse.json(order)),
    );
  }

  const contact = {
    phone: "+380 67 111 2233",
    email: "help@shop.example",
    workingHours: "Пн–Пт: 10:00 – 18:00",
  };

  const returnBlock = () =>
    screen.findByRole("region", { name: dict.order.guest.returnHeading });

  it("on a delivered order — says how to return, with the shop's own contacts", async () => {
    serveOrder();

    renderWithProviders(<GuestOrderView token="token-1" contact={contact} />);

    const block = within(await returnBlock());
    expect(block.getByRole("link", { name: contact.phone })).toHaveAttribute(
      "href",
      "tel:+380671112233",
    );
    expect(block.getByRole("link", { name: contact.email })).toHaveAttribute(
      "href",
      `mailto:${contact.email}`,
    );
    expect(block.getByText(contact.workingHours)).toBeInTheDocument();
    expect(
      block.getByRole("button", {
        name: dict.returnRequest.triggerAria("#ORDER-1"),
      }),
    ).toBeInTheDocument();
  });

  it("falls back to the storefront's default contacts when none are configured", async () => {
    serveOrder();

    renderWithProviders(<GuestOrderView token="token-1" contact={null} />);

    const block = within(await returnBlock());
    expect(
      block.getByRole("link", { name: dict.footer.contactPhone }),
    ).toBeInTheDocument();
    expect(
      block.getByRole("link", { name: dict.footer.contactEmail }),
    ).toBeInTheDocument();
  });

  it("files the return through the guest-token endpoint and shows it in the history", async () => {
    const user = userEvent.setup();
    serveOrder();
    const filed: ReturnEntity[] = [];
    const tokens: unknown[] = [];
    const bodies: unknown[] = [];
    server.use(
      http.get("*/api/orders/guest/:token/returns", () =>
        HttpResponse.json({ data: filed }),
      ),
      http.post(
        "*/api/orders/guest/:token/returns",
        async ({ request, params }) => {
          tokens.push(params.token);
          bodies.push(await request.json());
          const created = makeReturn({
            id: "abcd1234-new",
            channel: "GUEST_LINK",
            items: [
              {
                id: "ri-1",
                orderItemId: "line-1",
                quantity: 1,
                productName: "Чохол",
                price: "499.00",
              },
            ],
          });
          filed.push(created);
          return HttpResponse.json({ data: created }, { status: 201 });
        },
      ),
    );

    renderWithProviders(
      <>
        <GuestOrderView token="token-1" contact={contact} />
        <Toaster />
      </>,
    );

    await user.click(
      await screen.findByRole("button", {
        name: dict.returnRequest.triggerAria("#ORDER-1"),
      }),
    );
    const quantity = await screen.findByLabelText(
      dict.returnRequest.quantityAria("Чохол"),
    );
    await user.clear(quantity);
    await user.type(quantity, "1");
    await user.click(
      screen.getByRole("button", { name: dict.returnRequest.submit }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(tokens).toEqual(["token-1"]);
    expect(bodies[0]).toEqual({
      items: [{ orderItemId: "line-1", quantity: 1 }],
    });
    // The history picks the new request up by itself.
    const history = within(
      await screen.findByRole("region", {
        name: dict.returnRequest.historyTitle,
      }),
    );
    expect(
      await history.findByRole("heading", { name: /#ABCD1234/ }),
    ).toBeInTheDocument();
  });

  it("shows the decision and its reason on an earlier request", async () => {
    serveOrder();
    server.use(
      http.get("*/api/orders/guest/:token/returns", () =>
        HttpResponse.json({
          data: [
            makeReturn({
              status: "REJECTED",
              channel: "GUEST_LINK",
              decision: "REJECT",
              decisionReason: "Сліди використання",
              decidedAt: "2026-06-12T10:00:00.000Z",
            }),
          ],
        }),
      ),
    );

    renderWithProviders(<GuestOrderView token="token-1" contact={contact} />);

    const history = within(
      await screen.findByRole("region", {
        name: dict.returnRequest.historyTitle,
      }),
    );
    expect(history.getByText("Сліди використання")).toBeInTheDocument();
  });

  it("offers no return on an order that is not delivered — the account's rule", async () => {
    serveOrder(makeOrder({ userId: null, status: "SHIPPED" }));

    renderWithProviders(<GuestOrderView token="token-1" contact={contact} />);

    await screen.findByRole("heading", { level: 1, name: dict.order.thankYou });
    expect(
      screen.queryByRole("region", { name: dict.order.guest.returnHeading }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: dict.returnRequest.triggerAria("#ORDER-1"),
      }),
    ).toBeNull();
  });

  it("keeps the one not-found view for a bad link — no returns UI, no returns request", async () => {
    let returnCalls = 0;
    server.use(
      http.get("*/api/orders/guest/:token", () =>
        HttpResponse.json({ message: "Order not found" }, { status: 404 }),
      ),
      http.get("*/api/orders/guest/:token/returns", () => {
        returnCalls += 1;
        return HttpResponse.json(
          { message: "Order not found" },
          { status: 404 },
        );
      }),
    );

    renderWithProviders(<GuestOrderView token="bad-token" contact={contact} />);

    expect(
      await screen.findByRole("heading", {
        name: dict.order.guest.linkInvalidHeading,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: dict.order.guest.returnHeading }),
    ).toBeNull();
    expect(returnCalls).toBe(0);
  });
});
