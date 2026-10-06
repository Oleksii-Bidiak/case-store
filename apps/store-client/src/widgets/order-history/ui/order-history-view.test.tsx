import { http, HttpResponse } from "msw";
import {
  act,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeOrder, makeOrderItem } from "@/shared/test/msw-handlers";
import {
  statusBadgeStyle,
  type OrderEntity,
  type OrderEntityStatus,
} from "@/entities/order";
import { CALLBACK_WAIT_MS, rememberPaymentAttempt } from "@/features/checkout";
import { dict } from "@/shared/config";
import { OrderHistoryView } from "./order-history-view";
import { OrderHistorySkeleton } from "./order-history-skeleton";

const push = jest.fn();
const replace = jest.fn();
let params = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  usePathname: () => "/account/orders",
  useSearchParams: () => params,
}));

beforeEach(() => {
  sessionStorage.clear();
  push.mockClear();
  replace.mockClear();
  params = new URLSearchParams();
});

const h = dict.orderHistory;

/**
 * The trigger carries an aria-label naming its order, because on a history page
 * every row's button reads the same — so it is matched by that label, not by the
 * visible text an aria-label overrides.
 */
const RETURN_TRIGGER = new RegExp(dict.returnRequest.trigger);

/**
 * Every status the button must stay away from. Spelled as the generated union
 * rather than as strings: the list is the point of the test, and a status
 * renamed in the API has to break this file rather than quietly pass.
 */
const NOT_DELIVERED = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "CANCELLED",
] as const satisfies readonly OrderEntityStatus[];

const order = (overrides: Partial<OrderEntity>) => makeOrder(overrides).data;

/**
 * A small fake of `GET /api/orders`: filters by the repeated `status=` keys,
 * pages by `page`/`limit`, and answers with the real `meta` shape. Every
 * request URL is recorded so a test can assert what the view asked for.
 */
function serveOrders(orders: readonly OrderEntity[]) {
  const urls: URL[] = [];
  server.use(
    http.get("*/api/orders", ({ request }) => {
      const url = new URL(request.url);
      urls.push(url);
      const statuses = url.searchParams.getAll("status");
      const page = Number(url.searchParams.get("page") ?? 1);
      const limit = Number(url.searchParams.get("limit") ?? 10);
      const matching = statuses.length
        ? orders.filter((o) => statuses.includes(o.status))
        : [...orders];
      return HttpResponse.json({
        data: matching.slice((page - 1) * limit, page * limit),
        meta: {
          total: matching.length,
          page,
          limit,
          totalPages: Math.ceil(matching.length / limit),
        },
      });
    }),
  );
  return urls;
}

/** One order per status given, ids `order-1`, `order-2`, … */
const byStatus = (statuses: readonly OrderEntityStatus[]) =>
  statuses.map((status, index) => order({ id: `order-${index + 1}`, status }));

const renderHistory = (ui = <OrderHistoryView />) =>
  renderWithProviders(ui, {
    auth: { isAuthenticated: true, accessToken: "token" },
  });

/** The rendered card of an order, found through its heading. */
const card = (ref: string) =>
  screen
    .getByRole("heading", { name: `Замовлення #${ref}` })
    .closest("article") as HTMLElement;

describe("OrderHistoryView — tabs and URL (TASK-217)", () => {
  it("asks for the active group as repeated status keys, page 1 of 10", async () => {
    params = new URLSearchParams("status=active");
    const urls = serveOrders(byStatus(["PENDING", "SHIPPED", "DELIVERED"]));

    renderHistory();

    await screen.findByRole("heading", { name: "Замовлення #ORDER-1" });
    const main = urls.find((u) => u.searchParams.get("limit") === "10");
    expect(main?.searchParams.getAll("status")).toEqual([
      "PENDING",
      "CONFIRMED",
      "PROCESSING",
      "SHIPPED",
    ]);
    expect(main?.searchParams.get("page")).toBe("1");
    // Only the active orders are listed.
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("sends no status filter for «Усі», and treats an unknown tab as «Усі»", async () => {
    params = new URLSearchParams("status=whatever");
    const urls = serveOrders(byStatus(["PENDING", "CANCELLED"]));

    renderHistory();

    await screen.findAllByRole("article");
    const main = urls.find((u) => u.searchParams.get("limit") === "10");
    expect(main?.searchParams.getAll("status")).toEqual([]);
    expect(
      screen.getByRole("tab", { name: new RegExp(h.tabs.all) }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("asks every other tab for its total with limit=1 and shows the counts", async () => {
    const urls = serveOrders(
      byStatus([
        "PENDING",
        "SHIPPED",
        "DELIVERED",
        "DELIVERED",
        "CANCELLED",
        "REFUNDED",
      ]),
    );

    renderHistory();

    await waitFor(() =>
      expect(
        screen.getByRole("tab", { name: `${h.tabs.cancelled} 2` }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("tab", { name: `${h.tabs.all} 6` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: `${h.tabs.active} 2` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: `${h.tabs.delivered} 2` }),
    ).toBeInTheDocument();
    // The selected tab's total is the header counter, plural and all.
    expect(screen.getByText(h.count(6))).toBeInTheDocument();

    const countQueries = urls.filter(
      (u) => u.searchParams.get("limit") === "1",
    );
    expect(
      countQueries.map((u) => u.searchParams.getAll("status").join(",")).sort(),
    ).toEqual([
      "CANCELLED,REFUNDED",
      "DELIVERED",
      "PENDING,CONFIRMED,PROCESSING,SHIPPED",
    ]);
  });

  it("switching a tab drops the page but keeps other parameters", async () => {
    const user = userEvent.setup();
    params = new URLSearchParams("status=active&page=3&claimed=2");
    serveOrders(byStatus(["PENDING"]));

    renderHistory();
    await screen.findByRole("tab", { name: new RegExp(h.tabs.delivered) });

    await user.click(
      screen.getByRole("tab", { name: new RegExp(h.tabs.delivered) }),
    );

    expect(push).toHaveBeenCalledWith(
      "/account/orders?claimed=2&status=delivered",
      { scroll: false },
    );
  });

  it("pages with ?page= links and hides the control on a single page", async () => {
    params = new URLSearchParams("status=delivered&page=2");
    const many = Array.from({ length: 25 }, (_, i) =>
      order({
        id: `order-${String(i + 1).padStart(2, "0")}`,
        status: "DELIVERED",
      }),
    );
    serveOrders(many);

    renderHistory();

    const nav = await screen.findByRole("navigation", {
      name: dict.catalog.paginationAria,
    });
    expect(within(nav).getByRole("link", { name: "3" })).toHaveAttribute(
      "href",
      "/account/orders?status=delivered&page=3",
    );
    // Page 1 is the default and stays out of the URL.
    expect(within(nav).getByRole("link", { name: "1" })).toHaveAttribute(
      "href",
      "/account/orders?status=delivered",
    );
    expect(within(nav).getByRole("link", { name: "2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("renders no pagination when everything fits on one page", async () => {
    serveOrders(byStatus(["DELIVERED", "PENDING"]));

    renderHistory();

    await screen.findAllByRole("article");
    expect(
      screen.queryByRole("navigation", { name: dict.catalog.paginationAria }),
    ).not.toBeInTheDocument();
  });

  it("replaces a page past the end with the last one", async () => {
    params = new URLSearchParams("page=9");
    serveOrders(
      Array.from({ length: 12 }, (_, i) =>
        order({ id: `order-${i + 1}`, status: "DELIVERED" }),
      ),
    );

    renderHistory();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/account/orders?page=2", {
        scroll: false,
      }),
    );
  });
});

describe("OrderHistoryView — the card (TASK-217)", () => {
  it("links the number and «Деталі» to the account order detail", async () => {
    serveOrders([order({ id: "abcdef12-3456", status: "DELIVERED" })]);

    renderHistory();

    const heading = await screen.findByRole("heading", {
      name: "Замовлення #ABCDEF12",
    });
    expect(within(heading).getByRole("link")).toHaveAttribute(
      "href",
      "/account/orders/abcdef12-3456",
    );
    expect(
      screen.getByRole("link", { name: h.viewAria("ABCDEF12") }),
    ).toHaveAttribute("href", "/account/orders/abcdef12-3456");
  });

  it("counts units on the meta line and shows the total", async () => {
    serveOrders([
      order({
        status: "DELIVERED",
        total: "1633.00",
        items: [
          makeOrderItem({ id: "a", quantity: 1 }),
          makeOrderItem({ id: "b", quantity: 2 }),
        ],
      }),
    ]);

    renderHistory();

    await screen.findAllByRole("article");
    const article = card("ORDER-1");
    expect(article).toHaveTextContent(h.itemCount(3));
    expect(article).toHaveTextContent(/1\s633\s₴/);
    expect(article).toHaveTextContent(dict.order.paymentLabel("PENDING"));
  });

  it("shows four thumbnails + «+N» wide and three + «+N» narrow", async () => {
    serveOrders([
      order({
        status: "DELIVERED",
        items: Array.from({ length: 6 }, (_, i) =>
          makeOrderItem({ id: `line-${i}`, productName: `Товар ${i}` }),
        ),
      }),
    ]);

    renderHistory();

    await screen.findAllByRole("article");
    const article = card("ORDER-1");
    const thumbs = within(article).getAllByTestId("order-thumb");
    expect(thumbs).toHaveLength(4);
    // The 4th picture only from `sm` up…
    expect(thumbs[3]).toHaveClass("hidden", "sm:block");
    expect(thumbs[2]).not.toHaveClass("hidden");
    // …so «+N» counts the lines not pictured at each width: 6 − 4 and 6 − 3.
    expect(
      within(article).getByTestId("order-thumbs-more-wide"),
    ).toHaveTextContent("+2");
    expect(
      within(article).getByTestId("order-thumbs-more-narrow"),
    ).toHaveTextContent("+3");
  });

  it("shows no «+N» tile for three lines or fewer", async () => {
    serveOrders([
      order({
        status: "DELIVERED",
        items: Array.from({ length: 3 }, (_, i) =>
          makeOrderItem({ id: `line-${i}` }),
        ),
      }),
    ]);

    renderHistory();

    await screen.findAllByRole("article");
    expect(screen.queryByTestId("order-thumbs-more-wide")).toBeNull();
    expect(screen.queryByTestId("order-thumbs-more-narrow")).toBeNull();
  });

  it("offers the actions each state allows, with at most one primary per card", async () => {
    const soon = new Date(Date.now() + 10 * 60_000).toISOString();
    serveOrders([
      order({
        id: "await",
        status: "PENDING",
        paymentMethod: "ONLINE",
        paymentStatus: "PENDING",
        reservationExpiresAt: soon,
      }),
      order({ id: "cod", status: "PENDING" }),
      order({ id: "ship", status: "SHIPPED" }),
      order({ id: "deliv", status: "DELIVERED" }),
      order({ id: "cancel", status: "CANCELLED" }),
    ]);

    renderHistory();
    await screen.findAllByRole("article");

    const buttons = (ref: string) =>
      within(card(ref))
        .queryAllByRole("button")
        .map((b) => b.textContent);

    const [pay, cancel] = buttons("AWAIT");
    expect(pay).toMatch(/^Оплатити 998\s₴$/);
    expect(cancel).toBe(dict.cancelOrder.trigger);
    expect(buttons("AWAIT")).toHaveLength(2);
    expect(buttons("COD")).toEqual([dict.cancelOrder.trigger]);
    expect(buttons("SHIP")).toEqual([]);
    expect(buttons("DELIV")).toEqual([dict.returnRequest.trigger]);
    expect(buttons("CANCEL")).toEqual([]);

    for (const article of screen.getAllByRole("article")) {
      // «Деталі» is on every card, outline.
      expect(
        within(article).getByRole("link", { name: /^Деталі замовлення/ }),
      ).toHaveAttribute("data-variant", "outline");
      expect(
        article.querySelectorAll('[data-slot="button"][data-variant="default"]')
          .length,
      ).toBeLessThanOrEqual(1);
    }
    expect(
      card("AWAIT").querySelectorAll(
        '[data-slot="button"][data-variant="default"]',
      ),
    ).toHaveLength(1);
  });

  it("starts a new payment attempt from «Оплатити» and reports a failure", async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.post("*/api/payments/orders/:orderId/checkout", () => {
        calls += 1;
        return new HttpResponse(null, { status: 409 });
      }),
    );
    serveOrders([
      order({
        status: "PENDING",
        paymentMethod: "ONLINE",
        paymentStatus: "PENDING",
        reservationExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      }),
    ]);

    renderHistory();

    await user.click(await screen.findByRole("button", { name: /^Оплатити/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.order.payment.retryConflict,
    );
    expect(calls).toBe(1);
  });

  it("hides «Оплатити» while a payment this browser just started is confirmed", async () => {
    // Back from the bank before its callback landed: the order still reads
    // PENDING, and a second «Оплатити» would open a second payment.
    rememberPaymentAttempt("order-1", "payment-1");
    serveOrders([
      order({
        id: "order-1",
        status: "PENDING",
        paymentMethod: "ONLINE",
        paymentStatus: "PENDING",
        reservationExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      }),
    ]);

    renderHistory();

    expect(
      await screen.findByText(dict.order.payment.pendingTitle),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("order-awaiting-payment")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Оплатити/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: dict.cancelOrder.trigger }),
    ).toBeInTheDocument();
  });

  it("copies the ТТН of a shipped order and links to Nova Poshta tracking", async () => {
    const user = userEvent.setup();
    const write = jest.spyOn(navigator.clipboard, "writeText");
    serveOrders([
      order({ status: "SHIPPED", trackingNumber: "20450123456789" }),
    ]);

    renderHistory();

    const t = dict.order.tracking;
    await user.click(
      await screen.findByRole("button", { name: t.copyAria("20450123456789") }),
    );

    expect(write).toHaveBeenCalledWith("20450123456789");
    expect(
      await screen.findByRole("button", { name: t.copied }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      t.copiedLive("20450123456789"),
    );

    const track = screen.getByRole("link", { name: t.trackAria });
    expect(track).toHaveAttribute(
      "href",
      "https://novaposhta.ua/tracking/?cargo_number=20450123456789",
    );
    expect(track).toHaveAttribute("target", "_blank");
    expect(track).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows no ТТН tile before the order ships", async () => {
    serveOrders([
      order({ status: "PROCESSING", trackingNumber: "20450123456789" }),
    ]);

    renderHistory();

    await screen.findAllByRole("article");
    expect(screen.queryByTestId("order-tracking")).toBeNull();
  });
});

describe("OrderHistoryView — awaiting payment countdown (TASK-217)", () => {
  const START = Date.parse("2026-10-04T12:00:00.000Z");

  beforeEach(() => {
    // Only the clock and the timers are faked. MSW and React's scheduler run
    // on microtasks / setImmediate; faking those spins the test forever.
    jest.useFakeTimers({
      now: START,
      doNotFake: ["nextTick", "queueMicrotask", "setImmediate"],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("counts the minutes down and drops the note and «Оплатити» at zero", async () => {
    serveOrders([
      order({
        status: "PENDING",
        paymentMethod: "ONLINE",
        paymentStatus: "PENDING",
        // 2 min 10 s left → «3 хв» (rounded up).
        reservationExpiresAt: new Date(START + 130_000).toISOString(),
      }),
    ]);

    renderHistory();

    expect(await screen.findByText(h.awaitingPayment(3))).toBeInTheDocument();
    expect(screen.getByText(h.awaitingPaymentNote)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Оплатити/ }),
    ).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(screen.getByText(h.awaitingPayment(2))).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(90_000);
    });
    expect(screen.queryByTestId("order-awaiting-payment")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Оплатити/ })).toBeNull();
    // The order is still PENDING, so it can still be cancelled.
    expect(
      screen.getByRole("button", { name: dict.cancelOrder.trigger }),
    ).toBeInTheDocument();
  });

  it("offers «Оплатити» again once the callback wait is over", async () => {
    rememberPaymentAttempt("order-1", "payment-1", START);
    serveOrders([
      order({
        id: "order-1",
        status: "PENDING",
        paymentMethod: "ONLINE",
        paymentStatus: "PENDING",
        reservationExpiresAt: new Date(START + 20 * 60_000).toISOString(),
      }),
    ]);

    renderHistory();

    expect(
      await screen.findByText(dict.order.payment.pendingTitle),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Оплатити/ })).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(CALLBACK_WAIT_MS);
    });
    expect(screen.queryByText(dict.order.payment.pendingTitle)).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Оплатити/ }),
    ).toBeInTheDocument();
  });

  it("does not count down a cash-on-delivery order", async () => {
    serveOrders([
      order({
        status: "PENDING",
        paymentMethod: "ON_DELIVERY",
        reservationExpiresAt: new Date(START + 600_000).toISOString(),
      }),
    ]);

    renderHistory();

    await screen.findAllByRole("article");
    expect(screen.queryByTestId("order-awaiting-payment")).toBeNull();
  });
});

describe("OrderHistoryView — states (TASK-217, TASK-870)", () => {
  it("shows skeleton cards under the heading and tabs while the page loads", async () => {
    server.use(http.get("*/api/orders", () => new Promise<never>(() => {})));

    renderHistory();

    expect(
      screen.getByRole("heading", { level: 1, name: h.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getAllByTestId("order-card-skeleton")).toHaveLength(3);
  });

  it("shows the empty card — icon, line, primary to the catalogue — and no tabs", async () => {
    serveOrders([]);

    renderHistory();

    const line = await screen.findByText(h.empty);
    const box = line.parentElement as HTMLElement;
    // The glyph is decoration — hidden from assistive tech with its disc.
    const disc = box.querySelector('[aria-hidden="true"]');
    expect(disc?.querySelector("svg")).not.toBeNull();

    const cta = screen.getByRole("link", { name: h.emptyCta });
    expect(cta).toHaveAttribute("href", "/products");
    expect(cta).toHaveAttribute("data-variant", "default");
    expect(cta).toHaveClass("h-11");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("shows one muted line for an empty tab of a non-empty account", async () => {
    params = new URLSearchParams("status=cancelled");
    serveOrders(byStatus(["DELIVERED", "PENDING"]));

    renderHistory();

    expect(await screen.findByText(h.tabEmpty)).toBeInTheDocument();
    expect(screen.queryByText(h.empty)).not.toBeInTheDocument();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("reports a failed load and retries it", async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.get("*/api/orders", ({ request }) => {
        if (new URL(request.url).searchParams.get("limit") === "10") calls += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );

    renderHistory();

    expect(await screen.findByRole("alert")).toHaveTextContent(h.loadError);
    const before = calls;
    await user.click(screen.getByRole("button", { name: dict.common.retry }));
    await waitFor(() => expect(calls).toBeGreaterThan(before));
  });

  it("renders the notice slot between the heading and the tabs", async () => {
    serveOrders(byStatus(["DELIVERED"]));

    renderHistory(<OrderHistoryView notice={<p>Банер</p>} />);

    const notice = await screen.findByText("Банер");
    const tablist = screen.getByRole("tablist");
    expect(
      notice.compareDocumentPosition(tablist) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("OrderHistorySkeleton (TASK-217)", () => {
  it("mirrors the list: real heading and tab labels, three cards with three thumbs", () => {
    renderWithProviders(<OrderHistorySkeleton />);

    // AccountOrders.dc.html «Скелетон»: what needs no data is real.
    expect(
      screen.getByRole("heading", { level: 1, name: h.title }),
    ).toBeInTheDocument();
    const tabs = screen.getByTestId("order-tabs-skeleton");
    expect(tabs.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(tabs).toHaveTextContent(
      [h.tabs.all, h.tabs.active, h.tabs.delivered, h.tabs.cancelled].join(""),
    );
    const cards = screen.getAllByTestId("order-card-skeleton");
    expect(cards).toHaveLength(3);
    expect(cards[0].querySelectorAll(".size-13")).toHaveLength(3);
  });
});

/**
 * TASK-373 — the return request, which the account area could not open at all
 * before. Kept from the `/orders` era: the card must offer it on a delivered
 * order and nowhere else.
 */
describe("OrderHistoryView — return request (TASK-373)", () => {
  it("offers a return on a delivered order, labelled with that order", async () => {
    serveOrders(byStatus(["DELIVERED"]));

    renderHistory();

    expect(
      await screen.findByRole("button", {
        name: dict.returnRequest.triggerAria("#ORDER-1"),
      }),
    ).toBeInTheDocument();
  });

  it.each(NOT_DELIVERED)(
    "offers nothing on a %s order — the goods are not with the customer yet",
    async (status) => {
      serveOrders(byStatus([status]));

      renderHistory();

      await screen.findByRole("heading", { name: "Замовлення #ORDER-1" });
      expect(
        screen.queryByRole("button", { name: RETURN_TRIGGER }),
      ).not.toBeInTheDocument();
    },
  );

  it("writes the order date the way the confirmation and lookup pages do (TASK-809)", async () => {
    serveOrders(byStatus(["DELIVERED"]));

    renderHistory();

    // Kyiv day, full month: the fixture's midnight UTC is 03:00 on the 1st.
    expect(await screen.findByText(/1 червня 2026/)).toBeInTheDocument();
  });

  it("paints the status badge from the shared map (TASK-802, TASK-868)", async () => {
    serveOrders(byStatus(["DELIVERED"]));

    renderHistory();

    const label = await screen.findByText(
      dict.order.orderStatusLabels.DELIVERED,
    );
    const badge = label.closest('[data-slot="badge"]');
    expect(badge).toHaveAttribute(
      "data-variant",
      statusBadgeStyle("DELIVERED").variant,
    );
    expect(badge).toHaveAttribute("data-variant", "tint-success");
    // Named by plain sr-only text, never an aria-label on a <span>.
    expect(badge).not.toHaveAttribute("aria-label");
    expect(badge).toHaveTextContent(
      `${h.statusSr}: ${dict.order.orderStatusLabels.DELIVERED}`,
    );
  });

  describe("return request status (TASK-608)", () => {
    const returnRow = (
      orderId: string,
      status: string,
      requestedAt: string,
    ) => ({
      id: `return-${orderId}-${status}`,
      orderId,
      status,
      reason: null,
      requestedAt,
      resolvedAt: null,
      restockedAt: null,
      refundedAmount: null,
      items: [],
    });

    const returnBadges = () =>
      document.querySelectorAll("[data-return-status]");

    it("shows the status of the request next to its order", async () => {
      serveOrders(byStatus(["DELIVERED", "DELIVERED"]));
      server.use(
        http.get("*/api/returns", () =>
          HttpResponse.json({
            data: [returnRow("order-2", "APPROVED", "2026-09-20T10:00:00Z")],
          }),
        ),
      );

      renderHistory();

      const label = dict.returnRequest.statusLabels.APPROVED;
      await waitFor(() => expect(returnBadges()).toHaveLength(1));
      const badge = returnBadges()[0];
      expect(badge).toHaveTextContent(
        `${dict.returnRequest.statusSr}: ${label}`,
      );
      expect(card("ORDER-2")).toContainElement(badge as HTMLElement);
    });

    it("paints a refunded return as the solid success badge", async () => {
      serveOrders(byStatus(["DELIVERED"]));
      server.use(
        http.get("*/api/returns", () =>
          HttpResponse.json({
            data: [returnRow("order-1", "REFUNDED", "2026-09-20T10:00:00Z")],
          }),
        ),
      );

      renderHistory();

      await waitFor(() => expect(returnBadges()).toHaveLength(1));
      expect(returnBadges()[0]).toHaveAttribute("data-variant", "success");
    });

    it("shows the NEWEST request when an order has several", async () => {
      serveOrders(byStatus(["DELIVERED"]));
      server.use(
        http.get("*/api/returns", () =>
          HttpResponse.json({
            // The API answers newest first.
            data: [
              returnRow("order-1", "REQUESTED", "2026-09-21T10:00:00Z"),
              returnRow("order-1", "REFUNDED", "2026-09-01T10:00:00Z"),
            ],
          }),
        ),
      );

      renderHistory();

      expect(
        await screen.findByText(dict.returnRequest.statusLabels.REQUESTED),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(dict.returnRequest.statusLabels.REFUNDED),
      ).not.toBeInTheDocument();
    });

    it("still lists the orders when the returns request fails", async () => {
      serveOrders(byStatus(["DELIVERED"]));
      server.use(
        http.get(
          "*/api/returns",
          () => new HttpResponse(null, { status: 500 }),
        ),
      );

      renderHistory();

      expect(
        await screen.findByRole("heading", { name: "Замовлення #ORDER-1" }),
      ).toBeInTheDocument();
      expect(screen.queryByText(h.loadError)).not.toBeInTheDocument();
    });
  });

  it("offers it on the delivered order only, in a mixed list", async () => {
    serveOrders(byStatus(["PENDING", "DELIVERED"]));

    renderHistory();

    await screen.findByRole("heading", { name: "Замовлення #ORDER-1" });
    expect(
      screen.getAllByRole("button", { name: RETURN_TRIGGER }),
    ).toHaveLength(1);
  });
});
