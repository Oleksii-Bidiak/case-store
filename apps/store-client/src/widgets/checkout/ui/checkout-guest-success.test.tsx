import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { makeOrder } from "@/shared/test/msw-handlers";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib";
import { CheckoutGuestSuccess } from "./checkout-guest-success";

const d = dict.checkout.guest;
const order = makeOrder({ id: "94f5f971-aaaa-bbbb-cccc-000000000001" }).data;
const email = "guest@example.com";

/** Compare money on whitespace-stripped text: Intl (uk-UA) puts a narrow
 *  no-break space inside the amount. */
const byStrippedText = (expected: string) => (_: string, el: Element | null) =>
  el?.textContent?.replace(/\s/g, "") === expected.replace(/\s/g, "");

/**
 * TASK-610 — the one screen a guest sees exactly once. It is the only place the
 * shopper learns where the durable copy of the order link went, so every line
 * on it is load-bearing.
 */
describe("CheckoutGuestSuccess (TASK-610)", () => {
  it("names the order by its short number and shows the total", () => {
    renderWithProviders(<CheckoutGuestSuccess order={order} email={email} />);

    expect(
      screen.getByRole("heading", { name: d.successHeading }),
    ).toBeInTheDocument();
    expect(screen.getByText("#94F5F971")).toBeInTheDocument();
    expect(screen.getByText(d.successTotal)).toBeInTheDocument();
    expect(
      screen.getAllByText(byStrippedText(formatMoney(order.total))).length,
    ).toBeGreaterThan(0);
  });

  it("says which address the letter — the durable copy of the link — went to", () => {
    renderWithProviders(<CheckoutGuestSuccess order={order} email={email} />);

    expect(screen.getByText(d.successEmail(email))).toBeInTheDocument();
  });

  it("marks the checkout as finished: step 3 is the current step", () => {
    const { container } = renderWithProviders(
      <CheckoutGuestSuccess order={order} email={email} />,
    );

    const current = container.querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0].closest("li")).toHaveTextContent(
      dict.checkout.stepConfirm,
    );
    // TASK-1098: the last step reads «Готово».
    expect(current[0].closest("li")).toHaveTextContent("Готово");
  });

  it("shows no alert when the payment handoff went fine", () => {
    renderWithProviders(<CheckoutGuestSuccess order={order} email={email} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("announces a failed payment handoff as an alert, keeping the order details", () => {
    const message = "Не вдалося перейти до оплати.";

    renderWithProviders(
      <CheckoutGuestSuccess
        order={order}
        email={email}
        handoffMessage={message}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByText("#94F5F971")).toBeInTheDocument();
    expect(screen.getByText(d.successEmail(email))).toBeInTheDocument();
  });

  it("offers an account as an option, linking to /register", () => {
    renderWithProviders(<CheckoutGuestSuccess order={order} email={email} />);

    expect(
      screen.getByRole("link", { name: d.accountOfferCta }),
    ).toHaveAttribute("href", "/register");
    expect(
      screen.getByRole("link", { name: dict.common.continueShopping }),
    ).toHaveAttribute("href", "/");
  });
});

/**
 * TASK-679 — «Стежте за замовленням у Telegram». Offered only with the guest's
 * own order token and only while the shop's bot is available; the e-mail is
 * named as still coming either way.
 */
describe("CheckoutGuestSuccess — Telegram card (TASK-679)", () => {
  const tg = dict.telegramNotifications;
  const TOKEN = "f".repeat(64);
  const STATUS = "*/api/orders/guest/:token/notifications/telegram";

  function serveStatus(state: { available: boolean; connected: boolean }) {
    const tokens: string[] = [];
    server.use(
      http.get(STATUS, ({ params }) => {
        tokens.push(String(params.token));
        return HttpResponse.json({
          data: {
            ...state,
            botUsername: state.available ? "casestore_bot" : undefined,
          },
        });
      }),
    );
    return tokens;
  }

  function renderSuccess(token: string | null) {
    return renderWithProviders(
      <CheckoutGuestSuccess
        order={order}
        email={email}
        guestAccessToken={token}
        telegramPollIntervalMs={30}
      />,
    );
  }

  it("offers the card with the order number when the bot is available", async () => {
    const tokens = serveStatus({ available: true, connected: false });
    renderSuccess(TOKEN);

    expect(
      await screen.findByRole("heading", { name: tg.guest.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText(tg.guest.body("94F5F971"))).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: tg.connectGuest }),
    ).toBeInTheDocument();
    expect(tokens).toEqual([TOKEN]);
    // The card sits between the order and the account offer.
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings.indexOf(tg.guest.heading)).toBeLessThan(
      headings.indexOf(d.accountOfferHeading),
    );
  });

  it("is not offered without the guest's order token — and asks nothing", async () => {
    const tokens = serveStatus({ available: true, connected: false });
    renderSuccess(null);

    // Give a stray request the chance to land before asserting there was none.
    await screen.findByRole("heading", { name: d.successHeading });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      screen.queryByRole("heading", { name: tg.guest.heading }),
    ).not.toBeInTheDocument();
    expect(tokens).toEqual([]);
  });

  it("is hidden when the shop's bot is not available", async () => {
    const tokens = serveStatus({ available: false, connected: false });
    renderSuccess(TOKEN);

    await waitFor(() => expect(tokens).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      screen.queryByRole("heading", { name: tg.guest.heading }),
    ).not.toBeInTheDocument();
    // The rest of the success panel is untouched.
    expect(screen.getByText(d.successEmail(email))).toBeInTheDocument();
  });

  it("connected: says both Telegram and the e-mail will carry the news", async () => {
    serveStatus({ available: true, connected: true });
    renderSuccess(TOKEN);

    expect(await screen.findByRole("status")).toHaveTextContent(
      tg.guest.connected(email),
    );
    expect(
      screen.queryByRole("button", { name: tg.connectGuest }),
    ).not.toBeInTheDocument();
  });
});
