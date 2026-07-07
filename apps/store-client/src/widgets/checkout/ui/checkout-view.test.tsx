import { http, HttpResponse, delay } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeCart, makeUser } from "@/shared/test/msw-handlers";
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

const authed = {
  auth: { isAuthenticated: true, accessToken: "token" },
} as const;

/** Populated cart + a blank profile so the form starts empty for typing tests. */
function setupBlankProfile() {
  server.use(
    http.get("*/api/cart", () => HttpResponse.json(makeCart())),
    http.get("*/api/users/me", () =>
      HttpResponse.json(makeUser({ firstName: "", lastName: "", phone: "" })),
    ),
  );
}

/** Fill all required delivery (step-1) fields. Types city before the address
 *  because editing the city clears the dependent warehouse field. */
async function fillDelivery(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<{
    firstName: string;
    lastName: string;
    phone: string;
    city: string;
    address: string;
  }> = {},
) {
  const v = {
    firstName: "Олег",
    lastName: "Коваль",
    phone: "501234567",
    city: "Київ",
    address: "Відділення №1",
    ...overrides,
  };
  await user.type(
    screen.getByLabelText(dict.checkout.fields.firstName),
    v.firstName,
  );
  await user.type(
    screen.getByLabelText(dict.checkout.fields.lastName),
    v.lastName,
  );
  await user.type(screen.getByLabelText(dict.checkout.fields.phone), v.phone);
  await user.type(screen.getByLabelText(dict.checkout.fields.city), v.city);
  await user.type(
    screen.getByLabelText(dict.checkout.fields.deliveryAddress),
    v.address,
  );
}

describe("CheckoutView", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
  });

  it("redirects unauthenticated visitors to login", async () => {
    renderWithProviders(<CheckoutView />, {
      auth: { isAuthenticated: false, isInitializing: false },
    });

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/login?redirect=/checkout"),
    );
  });

  it("redirects to the cart when the authenticated user's cart is empty", async () => {
    server.use(http.get("*/api/cart", () => HttpResponse.json(makeCart([]))));

    renderWithProviders(<CheckoutView />, authed);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/cart"));
  });

  it("renders the checkout form for an authenticated user with a populated cart", async () => {
    server.use(http.get("*/api/cart", () => HttpResponse.json(makeCart())));

    renderWithProviders(<CheckoutView />, authed);

    expect(
      await screen.findByRole("heading", { name: dict.checkout.title }),
    ).toBeInTheDocument();
    // Step 1 shows "Далі" — the order-placing submit only appears on the review step.
    expect(
      screen.getByRole("button", { name: dict.checkout.nextStep }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.checkout.placeOrder }),
    ).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // TASK-119 regression: the backend empties the cart on order creation. The
  // post-order cart refetch must NOT trigger the empty-cart guard's
  // `router.replace("/cart")` and overwrite the push to the confirmation page.
  it("pushes to the confirmation page on success and does not redirect to /cart when the cart empties", async () => {
    let orderPlaced = false;
    server.use(
      // Empty profile → prefill resets fields to "" so the user types fresh.
      http.get("*/api/users/me", () =>
        HttpResponse.json(makeUser({ firstName: "", lastName: "", phone: "" })),
      ),
      http.get("*/api/cart", () =>
        HttpResponse.json(orderPlaced ? makeCart([]) : makeCart()),
      ),
      http.post("*/api/orders", () => {
        orderPlaced = true;
        return HttpResponse.json({ data: { id: "order-1" } }, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<CheckoutView />, authed);

    await screen.findByRole("heading", { name: dict.checkout.title });

    await user.type(
      screen.getByLabelText(dict.checkout.fields.firstName),
      "Олег",
    );
    await user.type(
      screen.getByLabelText(dict.checkout.fields.lastName),
      "Коваль",
    );
    // PhoneInput already shows the `+380` prefix; type the 9-digit local part.
    await user.type(
      screen.getByLabelText(dict.checkout.fields.phone),
      "501234567",
    );
    await user.type(screen.getByLabelText(dict.checkout.fields.city), "Київ");
    await user.type(
      screen.getByLabelText(dict.checkout.fields.deliveryAddress),
      "Відділення №1",
    );

    // Advance to the review step, then place the order from there (TASK-146).
    await user.click(
      screen.getByRole("button", { name: dict.checkout.nextStep }),
    );
    await screen.findByRole("heading", { name: dict.checkout.reviewHeading });
    await user.click(
      screen.getByRole("button", { name: dict.checkout.placeOrder }),
    );

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/orders/order-1/confirmation"),
    );

    // Let the post-order cart refetch (now empty) and its effect flush, then
    // assert the empty-cart guard never fired.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockReplace).not.toHaveBeenCalledWith("/cart");
  });

  // TASK-135 — profile prefill for logged-in users.
  it("pre-populates firstName, lastName, and phone from the profile", async () => {
    server.use(
      http.get("*/api/cart", () => HttpResponse.json(makeCart())),
      http.get("*/api/users/me", () => HttpResponse.json(makeUser())),
    );

    renderWithProviders(<CheckoutView />, authed);

    await screen.findByRole("heading", { name: dict.checkout.title });

    await waitFor(() =>
      expect(screen.getByLabelText(dict.checkout.fields.firstName)).toHaveValue(
        "Олег",
      ),
    );
    expect(screen.getByLabelText(dict.checkout.fields.lastName)).toHaveValue(
      "Коваль",
    );
    // The masked phone field shows the formatted value.
    expect(screen.getByLabelText(dict.checkout.fields.phone)).toHaveValue(
      "+380 50 123 4567",
    );
  });

  it("leaves city and deliveryAddress empty when the profile has no address data", async () => {
    server.use(
      http.get("*/api/cart", () => HttpResponse.json(makeCart())),
      http.get("*/api/users/me", () => HttpResponse.json(makeUser())),
    );

    renderWithProviders(<CheckoutView />, authed);

    await screen.findByRole("heading", { name: dict.checkout.title });

    // Wait for the prefill to run, then assert the address fields stay empty.
    await waitFor(() =>
      expect(screen.getByLabelText(dict.checkout.fields.firstName)).toHaveValue(
        "Олег",
      ),
    );
    expect(screen.getByLabelText(dict.checkout.fields.city)).toHaveValue("");
    expect(
      screen.getByLabelText(dict.checkout.fields.deliveryAddress),
    ).toHaveValue("");
  });

  it("does not overwrite a field the user has already typed when the profile loads", async () => {
    // Gate the profile response so it resolves strictly AFTER the user types.
    let resolveProfile!: () => void;
    const profileGate = new Promise<void>((resolve) => {
      resolveProfile = resolve;
    });
    server.use(
      http.get("*/api/cart", () => HttpResponse.json(makeCart())),
      http.get("*/api/users/me", async () => {
        await profileGate;
        await delay(0);
        return HttpResponse.json(makeUser());
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<CheckoutView />, authed);

    await screen.findByRole("heading", { name: dict.checkout.title });

    // Type before the profile resolves.
    await user.type(
      screen.getByLabelText(dict.checkout.fields.firstName),
      "Тарас",
    );

    // Now let the profile load.
    resolveProfile();

    // Phone was not touched, so the prefill seeds it — proof the reset ran.
    await waitFor(() =>
      expect(screen.getByLabelText(dict.checkout.fields.phone)).toHaveValue(
        "+380 50 123 4567",
      ),
    );

    // The user's in-progress firstName edit is preserved (keepDirtyValues).
    expect(screen.getByLabelText(dict.checkout.fields.firstName)).toHaveValue(
      "Тарас",
    );
  });

  it("handles a profile with a null phone gracefully — phone field shows just the prefix", async () => {
    server.use(
      http.get("*/api/cart", () => HttpResponse.json(makeCart())),
      http.get("*/api/users/me", () =>
        HttpResponse.json(makeUser({ phone: null })),
      ),
    );

    renderWithProviders(<CheckoutView />, authed);

    await screen.findByRole("heading", { name: dict.checkout.title });

    // Wait for the prefill (name arrives), then assert the phone mask prefix.
    await waitFor(() =>
      expect(screen.getByLabelText(dict.checkout.fields.firstName)).toHaveValue(
        "Олег",
      ),
    );
    expect(screen.getByLabelText(dict.checkout.fields.phone)).toHaveValue(
      "+380",
    );
  });

  // ── TASK-146: multi-step flow ──────────────────────────────────────────────

  it("shows 'Далі' on step 1 and 'Підтвердити замовлення' only on step 2", async () => {
    setupBlankProfile();
    const user = userEvent.setup();
    renderWithProviders(<CheckoutView />, authed);

    await screen.findByRole("heading", { name: dict.checkout.title });

    // Step 1
    expect(
      screen.getByRole("button", { name: dict.checkout.nextStep }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.checkout.placeOrder }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.checkout.prevStep }),
    ).not.toBeInTheDocument();

    await fillDelivery(user);
    await user.click(
      screen.getByRole("button", { name: dict.checkout.nextStep }),
    );

    // Step 2
    await screen.findByRole("heading", { name: dict.checkout.reviewHeading });
    expect(
      screen.getByRole("button", { name: dict.checkout.placeOrder }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.checkout.prevStep }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.checkout.nextStep }),
    ).not.toBeInTheDocument();
  });

  it("does not advance to step 2 when delivery fields are invalid", async () => {
    setupBlankProfile();
    const user = userEvent.setup();
    renderWithProviders(<CheckoutView />, authed);

    await screen.findByRole("heading", { name: dict.checkout.title });

    // Click "Далі" without filling anything.
    await user.click(
      screen.getByRole("button", { name: dict.checkout.nextStep }),
    );

    // Still on step 1: the review heading never appears and an error is shown.
    expect(
      await screen.findByText(dict.checkout.validation.firstName),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: dict.checkout.reviewHeading }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.checkout.placeOrder }),
    ).not.toBeInTheDocument();
  });

  it("returns to step 1 when 'Назад' is clicked on step 2", async () => {
    setupBlankProfile();
    const user = userEvent.setup();
    renderWithProviders(<CheckoutView />, authed);

    await screen.findByRole("heading", { name: dict.checkout.title });
    await fillDelivery(user);
    await user.click(
      screen.getByRole("button", { name: dict.checkout.nextStep }),
    );
    await screen.findByRole("heading", { name: dict.checkout.reviewHeading });

    await user.click(
      screen.getByRole("button", { name: dict.checkout.prevStep }),
    );

    // Back on step 1: the address form is visible again with the entered value.
    expect(
      await screen.findByRole("button", { name: dict.checkout.nextStep }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(dict.checkout.fields.firstName)).toHaveValue(
      "Олег",
    );
  });

  it("step indicator reflects the current step via aria-current", async () => {
    setupBlankProfile();
    const user = userEvent.setup();
    renderWithProviders(<CheckoutView />, authed);

    await screen.findByRole("heading", { name: dict.checkout.title });

    // Step 1 active initially.
    let current = document.querySelector('[aria-current="step"]');
    expect(current).toHaveTextContent("1");

    await fillDelivery(user);
    await user.click(
      screen.getByRole("button", { name: dict.checkout.nextStep }),
    );
    await screen.findByRole("heading", { name: dict.checkout.reviewHeading });

    // Step 2 active after advancing.
    current = document.querySelector('[aria-current="step"]');
    expect(current).not.toHaveTextContent("1");
  });

  it("review step shows the delivery data entered on step 1", async () => {
    setupBlankProfile();
    const user = userEvent.setup();
    renderWithProviders(<CheckoutView />, authed);

    await screen.findByRole("heading", { name: dict.checkout.title });
    await fillDelivery(user, {
      firstName: "Тарас",
      lastName: "Шевченко",
      city: "Харків",
      address: "Відділення №5",
    });
    await user.click(
      screen.getByRole("button", { name: dict.checkout.nextStep }),
    );

    const review = (
      await screen.findByRole("heading", { name: dict.checkout.reviewHeading })
    ).closest("section") as HTMLElement;
    expect(review).toHaveTextContent("Тарас Шевченко");
    expect(review).toHaveTextContent("Харків");
    expect(review).toHaveTextContent("Відділення №5");
  });

  // ── TASK-261: begin_checkout analytics ─────────────────────────────────────
  describe("begin_checkout analytics", () => {
    afterEach(() => {
      delete window.umami;
    });

    it("reports begin_checkout once with the cart item count after the cart loads", async () => {
      const track = jest.fn();
      window.umami = { track };
      server.use(http.get("*/api/cart", () => HttpResponse.json(makeCart())));

      renderWithProviders(<CheckoutView />, authed);
      await screen.findByRole("heading", { name: dict.checkout.title });

      await waitFor(() =>
        expect(track).toHaveBeenCalledWith("begin_checkout", { itemCount: 1 }),
      );
      expect(
        track.mock.calls.filter(([name]) => name === "begin_checkout"),
      ).toHaveLength(1);
    });

    it("does not report begin_checkout for an unauthenticated visitor", async () => {
      const track = jest.fn();
      window.umami = { track };

      renderWithProviders(<CheckoutView />, {
        auth: { isAuthenticated: false, isInitializing: false },
      });

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith("/login?redirect=/checkout"),
      );
      expect(track).not.toHaveBeenCalled();
    });
  });
});
