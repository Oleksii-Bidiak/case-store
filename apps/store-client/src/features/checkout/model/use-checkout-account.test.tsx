import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { useCheckout } from "./use-checkout";
import type { CheckoutFormValues } from "./checkout-schema";

// next/navigation is unavailable under jsdom — mock the router. Names are
// `mock`-prefixed so jest allows them inside the hoisted factory.
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const VALUES: CheckoutFormValues = {
  firstName: "Олег",
  lastName: "Коваль",
  phone: "+380501234567",
  deliveryMethod: "NOVA_POSHTA",
  city: "м. Київ, Київська обл.",
  npCityRef: "city-ref-1",
  deliveryAddress: "Відділення №1",
  npWarehouseRef: "wh-ref-1",
  notes: "",
  email: "guest@example.com",
  paymentMethod: "ON_DELIVERY",
  createAccount: true,
};

/** A guest's checkout that submits a fixed, valid form and shows the outcome. */
function Harness({
  values = VALUES,
  onOutcome,
}: {
  values?: CheckoutFormValues;
  onOutcome?: (outcome: string) => void;
}) {
  const { submitOrder, placedOrder, accountPending, errorMessage } =
    useCheckout({ isGuest: true });
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          void submitOrder(values).then((outcome) => onOutcome?.(outcome))
        }
      >
        submit
      </button>
      {placedOrder && <p data-testid="placed">{placedOrder.id}</p>}
      <p data-testid="pending">{String(accountPending)}</p>
      {errorMessage && <p role="alert">{errorMessage}</p>}
    </div>
  );
}

/** Answer `POST /orders` with `data` and keep the request body. */
function answerOrder(data: Record<string, unknown>) {
  const captured: { body: Record<string, unknown> | null } = { body: null };
  server.use(
    http.post("*/api/orders", async ({ request }) => {
      captured.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ data }, { status: 201 });
    }),
  );
  return captured;
}

const contactOf = (body: Record<string, unknown> | null) =>
  body?.contact as Record<string, unknown> | undefined;

/**
 * TASK-2010 (B-12 тема 2): a guest who ticks «Створити акаунт» places the order
 * on a password-less account created in the same transaction — and, with the
 * session that comes back, finishes as a signed-in shopper.
 */
describe("useCheckout — the account created with the order (TASK-2010)", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
  });

  it("sends createAccount as a JSON boolean — false when the box is clear", async () => {
    const order = answerOrder({ id: "order-1" });
    const user = userEvent.setup();
    renderWithProviders(
      <Harness values={{ ...VALUES, createAccount: false }} />,
    );

    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => expect(order.body).not.toBeNull());
    expect(contactOf(order.body)?.createAccount).toBe(false);
  });

  it("with a session: stores it and takes the account's confirmation route", async () => {
    const order = answerOrder({
      id: "order-7",
      userId: "user-1",
      session: { accessToken: "new.session.token" },
    });
    const setTokens = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness />, { auth: { setTokens } });

    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/orders/order-7/confirmation"),
    );
    expect(setTokens).toHaveBeenCalledWith("new.session.token");
    expect(contactOf(order.body)?.createAccount).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByTestId("placed")).toBeNull();
  });

  it("with a session and card: opens the payment attempt for the account's order", async () => {
    answerOrder({
      id: "order-8",
      userId: "user-1",
      session: { accessToken: "new.session.token" },
    });
    let paidOrder: string | null = null;
    server.use(
      http.post("*/api/payments/orders/:orderId/checkout", ({ params }) => {
        paidOrder = String(params.orderId);
        // Failing the handoff keeps the browser here; the route is the point.
        return HttpResponse.json({ message: "unavailable" }, { status: 503 });
      }),
    );
    const setTokens = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Harness values={{ ...VALUES, paymentMethod: "ONLINE" }} />,
      { auth: { setTokens } },
    );

    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/orders/order-8/confirmation"),
    );
    expect(paidOrder).toBe("order-8");
    // Stored before the handoff, which is behind JwtAuthGuard.
    expect(setTokens).toHaveBeenCalledWith("new.session.token");
  });

  it("without a session: the in-place panel, the letter pending, no navigation", async () => {
    answerOrder({ id: "order-5", userId: "user-1" });
    const setTokens = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness />, { auth: { setTokens } });

    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(await screen.findByTestId("placed")).toHaveTextContent("order-5");
    expect(screen.getByTestId("pending")).toHaveTextContent("true");
    expect(setTokens).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("ignores a session the guest never asked for", async () => {
    answerOrder({
      id: "order-6",
      guestAccessToken: "g".repeat(64),
      session: { accessToken: "unexpected" },
    });
    const setTokens = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Harness values={{ ...VALUES, createAccount: false }} />,
      { auth: { setTokens } },
    );

    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(setTokens).not.toHaveBeenCalled();
  });

  it("409 ACCOUNT_EXISTS is its own outcome, with no alert text", async () => {
    server.use(
      http.post("*/api/orders", () =>
        HttpResponse.json(
          { statusCode: 409, error: "ACCOUNT_EXISTS", message: "exists" },
          { status: 409 },
        ),
      ),
    );
    const onOutcome = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness onOutcome={onOutcome} />);

    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() =>
      expect(onOutcome).toHaveBeenCalledWith("account-exists"),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    ["DISCOUNT_ACCOUNT_REQUIRED", dict.checkout.errorDiscountAccountRequired],
    ["PAYMENT_ACCOUNT_REQUIRED", dict.checkout.errorPaymentAccountRequired],
  ])("%s says why in Ukrainian and asks for the box", async (code, text) => {
    server.use(
      http.post("*/api/orders", () =>
        HttpResponse.json(
          { statusCode: 400, error: code, message: "English sentence" },
          { status: 400 },
        ),
      ),
    );
    const onOutcome = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        values={{ ...VALUES, createAccount: false }}
        onOutcome={onOutcome}
      />,
    );

    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(onOutcome).toHaveBeenCalledWith("account-required");
  });
});
