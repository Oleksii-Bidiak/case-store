import { useMemo, useState, type ReactNode } from "react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  render,
  screen,
  waitFor,
  within,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import {
  AuthContext,
  type AuthContextValue,
} from "@/entities/session/model/auth.context";
import { clearAppliedDiscount } from "@/entities/discount";
import {
  makeCart,
  makeCity,
  makeOrder,
  makeWarehouse,
} from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import { CheckoutView } from "./checkout-view";

// next/navigation is not available under jsdom — mock the router. Names are
// `mock`-prefixed so jest allows them inside the hoisted factory.
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/checkout",
}));

const g = dict.checkout.guest;
const EMAIL = "olena@example.com";
const NP_CITY = makeCity().name;
const NP_WAREHOUSE = makeWarehouse().description;

type User = ReturnType<typeof userEvent.setup>;

/**
 * A guest whose session can really begin mid-test: `setTokens` flips
 * `isAuthenticated` the way the real provider does, so the inline sign-in and
 * the session returned with an order are observable in the view.
 */
function renderCheckout() {
  const setTokens = jest.fn();
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  function Auth({ children }: { children: ReactNode }) {
    const [token, setToken] = useState<string | null>(null);
    const value = useMemo<AuthContextValue>(
      () => ({
        accessToken: token,
        userId: token ? "user-1" : null,
        role: token ? "CUSTOMER" : null,
        isAuthenticated: token !== null,
        isInitializing: false,
        setTokens: (next: string) => {
          setTokens(next);
          setToken(next);
        },
        clearTokens: () => setToken(null),
      }),
      [token],
    );
    return (
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
  }

  render(
    <QueryClientProvider client={client}>
      <Auth>
        <CheckoutView />
      </Auth>
    </QueryClientProvider>,
  );
  return { setTokens };
}

const emailInput = () =>
  screen.getByLabelText(g.emailLabel, { selector: "#checkout-email" });
const accountBox = () =>
  screen.getByRole("checkbox", { name: g.createAccountLabel });

async function typeEmail(user: User, email = EMAIL) {
  await user.type(emailInput(), email);
  await user.tab(); // the blur asks whether the address has an account
}

async function fillDelivery(user: User) {
  await user.type(
    screen.getByLabelText(dict.checkout.fields.firstName),
    "Олег",
  );
  await user.type(
    screen.getByLabelText(dict.checkout.fields.lastName),
    "Коваль",
  );
  await user.type(
    screen.getByLabelText(dict.checkout.fields.phone),
    "501234567",
  );
  await user.type(screen.getByLabelText(dict.checkout.fields.city), "Київ");
  await user.click(await screen.findByText(NP_CITY));
  await user.type(
    screen.getByLabelText(dict.checkout.delivery.npWarehouseLabel),
    "1",
  );
  await user.click(await screen.findByText(NP_WAREHOUSE));
}

async function placeOrder(user: User) {
  await user.click(
    screen.getByRole("button", { name: dict.checkout.nextStep }),
  );
  await screen.findByRole("heading", { name: dict.checkout.reviewHeading });
  await user.click(
    screen.getByRole("checkbox", { name: dict.checkout.consent.prefix }),
  );
  await user.click(
    screen.getByRole("button", { name: dict.checkout.placeOrder }),
  );
}

/** Capture `POST /orders` and answer with `respond`. */
function captureOrder(
  respond: () => Response = () =>
    HttpResponse.json(makeOrder({ userId: null }), { status: 201 }),
) {
  const captured: { body: Record<string, unknown> | null } = { body: null };
  server.use(
    http.post("*/api/orders", async ({ request }) => {
      captured.body = (await request.json()) as Record<string, unknown>;
      return respond();
    }),
  );
  return captured;
}

/** The order answer of a guest who ticked the box (TASK-2010). */
function accountOrder(session?: { accessToken: string }) {
  const order = makeOrder({ id: "order-acc", userId: "user-1" }).data;
  return HttpResponse.json(
    { data: { ...order, ...(session ? { session } : {}) } },
    { status: 201 },
  );
}

function hasAccount(answer: boolean) {
  const asked: string[] = [];
  server.use(
    http.post("*/api/auth/checkout/email-status", async ({ request }) => {
      asked.push(((await request.json()) as { email: string }).email);
      return HttpResponse.json({ data: { hasAccount: answer } });
    }),
  );
  return asked;
}

describe("CheckoutView — an account in checkout (TASK-2010)", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
    clearAppliedDiscount();
    window.sessionStorage.clear();
    delete process.env.NEXT_PUBLIC_PAYMENT_METHODS;
    server.use(http.get("*/api/cart", () => HttpResponse.json(makeCart())));
  });

  it("offers «Створити акаунт», off by default, with what it means", async () => {
    renderCheckout();
    await screen.findByRole("heading", { name: dict.checkout.title });

    expect(accountBox()).not.toBeChecked();
    expect(accountBox()).toHaveAccessibleDescription(g.createAccountHint);
  });

  it("a ticked box creates the account: the session is stored and the order opens as the account's", async () => {
    const order = captureOrder(() =>
      accountOrder({ accessToken: "new.session.token" }),
    );
    const user = userEvent.setup();
    const { setTokens } = renderCheckout();
    await screen.findByRole("heading", { name: dict.checkout.title });

    await typeEmail(user);
    await user.click(accountBox());
    await fillDelivery(user);
    await placeOrder(user);

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/orders/order-acc/confirmation"),
    );
    expect(order.body?.contact).toMatchObject({
      email: EMAIL,
      createAccount: true,
    });
    expect(setTokens).toHaveBeenCalledWith("new.session.token");
    // Never the guest token page — the order is the account's.
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.stringContaining("/orders/guest/"),
    );
  });

  it("an account without a session: the order is in, the letter finishes the account", async () => {
    captureOrder(() => accountOrder());
    const user = userEvent.setup();
    const { setTokens } = renderCheckout();
    await screen.findByRole("heading", { name: dict.checkout.title });

    await typeEmail(user);
    await user.click(accountBox());
    await fillDelivery(user);
    await placeOrder(user);

    expect(
      await screen.findByRole("heading", { name: g.successHeading }),
    ).toBeInTheDocument();
    expect(screen.getByText(g.accountPendingNote)).toBeInTheDocument();
    expect(setTokens).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  describe("the address already has an account", () => {
    it("swaps the box for a sign-in on the checkout address", async () => {
      const asked = hasAccount(true);
      const user = userEvent.setup();
      renderCheckout();
      await screen.findByRole("heading", { name: dict.checkout.title });

      await typeEmail(user, "  Olena@Example.com ");

      const block = await screen.findByRole("group", {
        name: g.accountExistsHeading,
      });
      expect(asked).toEqual([EMAIL]);
      expect(
        screen.queryByRole("checkbox", { name: g.createAccountLabel }),
      ).toBeNull();
      expect(within(block).getByLabelText(dict.auth.login.email)).toHaveValue(
        "Olena@Example.com",
      );
      // A guest may still go on without signing in.
      expect(within(block).getByText(g.continueAsGuest)).toBeInTheDocument();
      // No «Реєстрація» in a block that exists because the account does.
      expect(
        within(block).queryByRole("link", {
          name: dict.auth.login.registerLink,
        }),
      ).toBeNull();
    });

    it("signing in keeps everything typed and drops the guest block", async () => {
      hasAccount(true);
      const user = userEvent.setup();
      const { setTokens } = renderCheckout();
      await screen.findByRole("heading", { name: dict.checkout.title });

      await user.type(
        screen.getByLabelText(dict.checkout.fields.firstName),
        "Олег",
      );
      await typeEmail(user);
      const block = await screen.findByRole("group", {
        name: g.accountExistsHeading,
      });
      await user.type(
        within(block).getByLabelText(dict.auth.login.password),
        "secret123",
      );
      await user.click(
        within(block).getByRole("button", { name: dict.auth.login.submit }),
      );

      await waitFor(() =>
        expect(setTokens).toHaveBeenCalledWith("test.access.token"),
      );
      await waitFor(() =>
        expect(
          screen.queryByLabelText(g.emailLabel, {
            selector: "#checkout-email",
          }),
        ).toBeNull(),
      );
      // Still step 1, the name typed as a guest survives the profile prefill.
      expect(screen.getByLabelText(dict.checkout.fields.firstName)).toHaveValue(
        "Олег",
      );
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("«Немає пароля?» sends a sign-in link to the checkout address, neutrally", async () => {
      hasAccount(true);
      const sent: unknown[] = [];
      server.use(
        http.post("*/api/auth/password-reset/request", async ({ request }) => {
          sent.push(await request.json());
          return HttpResponse.json({ data: { message: "ok" } });
        }),
      );
      const user = userEvent.setup();
      renderCheckout();
      await screen.findByRole("heading", { name: dict.checkout.title });

      await typeEmail(user);
      await user.click(
        await screen.findByRole("button", { name: g.noPasswordCta }),
      );

      expect(await screen.findByText(g.noPasswordSent)).toBeInTheDocument();
      expect(sent).toEqual([{ email: EMAIL }]);
    });

    it("never blocks checkout when the hint itself fails (429)", async () => {
      server.use(
        http.post("*/api/auth/checkout/email-status", () =>
          HttpResponse.json({ statusCode: 429 }, { status: 429 }),
        ),
      );
      const user = userEvent.setup();
      renderCheckout();
      await screen.findByRole("heading", { name: dict.checkout.title });

      await typeEmail(user);

      await waitFor(() => expect(accountBox()).toBeInTheDocument());
      expect(
        screen.queryByRole("group", { name: g.accountExistsHeading }),
      ).toBeNull();
    });

    it("a 409 ACCOUNT_EXISTS returns to the e-mail with the sign-in focused", async () => {
      captureOrder(() =>
        HttpResponse.json(
          { statusCode: 409, error: "ACCOUNT_EXISTS", message: "exists" },
          { status: 409 },
        ),
      );
      const user = userEvent.setup();
      renderCheckout();
      await screen.findByRole("heading", { name: dict.checkout.title });

      await typeEmail(user);
      await user.click(accountBox());
      await fillDelivery(user);
      await placeOrder(user);

      const block = await screen.findByRole("group", {
        name: g.accountExistsHeading,
      });
      await waitFor(() => expect(block).toHaveFocus());
      // The answer is the sign-in, not an alert on top of the form.
      expect(
        screen.queryByText(dict.checkout.orderErrorTitle),
      ).not.toBeInTheDocument();
    });
  });

  describe("the box ticks itself — and unticking says what it changed", () => {
    it("a promo code ticks it, with the reason; unticking removes the code", async () => {
      const user = userEvent.setup();
      renderCheckout();
      await screen.findByRole("heading", { name: dict.checkout.title });

      await user.type(
        screen.getByLabelText(dict.discounts.inputAria),
        "welcome10",
      );
      await user.click(
        screen.getByRole("button", { name: dict.discounts.apply }),
      );
      expect(
        await screen.findByText(dict.discounts.appliedLabel("WELCOME10")),
      ).toBeInTheDocument();
      expect(
        screen.getByText(dict.discounts.requiresAccountNote),
      ).toBeInTheDocument();

      await waitFor(() => expect(accountBox()).toBeChecked());
      expect(screen.getByText(g.createAccountForPromo)).toBeInTheDocument();

      await user.click(accountBox());

      expect(accountBox()).not.toBeChecked();
      expect(await screen.findByText(g.promoRemoved)).toBeInTheDocument();
      expect(
        screen.queryByText(dict.discounts.appliedLabel("WELCOME10")),
      ).toBeNull();
    });

    it("card ticks it; unticking moves payment to «при отриманні»", async () => {
      process.env.NEXT_PUBLIC_PAYMENT_METHODS = "ONLINE";
      const user = userEvent.setup();
      renderCheckout();
      await screen.findByRole("heading", { name: dict.checkout.title });

      const online = screen.getByRole("radio", { name: /Картка онлайн/ });
      expect(online).toBeEnabled();
      await user.click(online);

      await waitFor(() => expect(accountBox()).toBeChecked());
      expect(screen.getByText(g.createAccountForCard)).toBeInTheDocument();

      await user.click(accountBox());

      expect(
        screen.getByRole("radio", {
          name: new RegExp(dict.checkout.payment.onDeliveryTitle),
        }),
      ).toBeChecked();
      expect(await screen.findByText(g.paymentSwitched)).toBeInTheDocument();
    });

    it("a refused code without the box comes back ticked, with the Ukrainian reason", async () => {
      captureOrder(() =>
        HttpResponse.json(
          {
            statusCode: 400,
            error: "DISCOUNT_ACCOUNT_REQUIRED",
            message: "A promo code needs an account",
          },
          { status: 400 },
        ),
      );
      const user = userEvent.setup();
      renderCheckout();
      await screen.findByRole("heading", { name: dict.checkout.title });

      await typeEmail(user);
      await fillDelivery(user);
      await placeOrder(user);

      expect(
        await screen.findByText(dict.checkout.errorDiscountAccountRequired),
      ).toBeInTheDocument();
      expect(accountBox()).toBeChecked();
    });
  });
});
