import { http, HttpResponse, delay } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  render,
  renderWithProviders,
  screen,
  waitFor,
  within,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { AuthProvider } from "@/entities/session";
import {
  api,
  clearSessionMarker,
  markSessionActive,
  setAccessToken,
} from "@/shared/api";
import { makeCart, makeOrder, makeUser } from "@/shared/test/msw-handlers";
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

/** Tick the offer + privacy consent the confirm step requires (TASK-882). */
async function acceptConsent(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("checkbox", { name: dict.checkout.consent.prefix }),
  );
}

/** A visitor with no session — the shopper TASK-338 exists to serve. */
const guest = {
  auth: { isAuthenticated: false, isInitializing: false },
} as const;

describe("CheckoutView", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
    delete process.env.NEXT_PUBLIC_PAYMENT_METHODS;
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
    await acceptConsent(user);
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

  it("puts the step's one primary in the mobile «До сплати» bar with the summary's total, and the trust strip under the summary (TASK-864)", async () => {
    setupBlankProfile();
    const user = userEvent.setup();
    renderWithProviders(<CheckoutView />, authed);
    await screen.findByRole("heading", { name: dict.checkout.title });

    // Step 1: exactly one «Далі», and it rides in the bar — the bar
    // dissolves from md up (`md:contents`), so there is never a second copy.
    const next = screen.getAllByRole("button", {
      name: dict.checkout.nextStep,
    });
    expect(next).toHaveLength(1);
    const bar = screen.getByTestId("mobile-pay-bar");
    expect(bar).toContainElement(next[0]);
    expect(bar).toHaveClass("fixed", "bottom-0", "md:contents");
    // The bar's amount is the summary's «До сплати», not a second sum.
    await waitFor(() => {
      const amounts = screen
        .getAllByText(dict.checkout.totalLine)
        .map((label) => label.parentElement?.textContent?.replace(/\s/g, ""));
      expect(amounts).toHaveLength(2);
      expect(new Set(amounts).size).toBe(1);
    });

    expect(
      screen.getByRole("list", { name: dict.trust.orderAria }),
    ).toBeInTheDocument();

    // Step 2: the confirm moves into the bar; «Назад» stays in the flow.
    await fillDelivery(user);
    await user.click(next[0]);
    await screen.findByRole("heading", { name: dict.checkout.reviewHeading });
    const reviewBar = screen.getByTestId("mobile-pay-bar");
    expect(reviewBar).toContainElement(
      screen.getByRole("button", { name: dict.checkout.placeOrder }),
    );
    expect(reviewBar).not.toContainElement(
      screen.getByRole("button", { name: dict.checkout.prevStep }),
    );
  });

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

  // ── TASK-882: complete read-back + the offer consent ──────────────────────
  describe("review step and consent (TASK-882)", () => {
    async function toReview(user: ReturnType<typeof userEvent.setup>) {
      await user.click(
        screen.getByRole("button", { name: dict.checkout.nextStep }),
      );
      return (
        await screen.findByRole("heading", {
          name: dict.checkout.reviewHeading,
        })
      ).closest("section") as HTMLElement;
    }

    it("reads back a guest's email, one delivery row and the chosen payment method", async () => {
      server.use(http.get("*/api/cart", () => HttpResponse.json(makeCart())));
      const user = userEvent.setup();
      renderWithProviders(<CheckoutView />, guest);

      await screen.findByRole("heading", { name: dict.checkout.title });
      await user.type(
        screen.getByLabelText(dict.checkout.guest.emailLabel),
        "olena@example.com",
      );
      await fillDelivery(user, { city: "Київ", address: "Відділення №1" });
      const review = await toReview(user);

      expect(review).toHaveTextContent(dict.checkout.review.email);
      expect(review).toHaveTextContent("olena@example.com");
      expect(review).toHaveTextContent(
        `${dict.checkout.review.delivery}Київ, Відділення №1`,
      );
      expect(review).toHaveTextContent(
        `${dict.checkout.review.payment}${dict.checkout.payment.onDeliveryTitle}`,
      );
    });

    it("names the online method a signed-in shopper picked, and shows them no email row", async () => {
      process.env.NEXT_PUBLIC_PAYMENT_METHODS = "ONLINE";
      setupBlankProfile();
      const user = userEvent.setup();
      renderWithProviders(<CheckoutView />, authed);

      await screen.findByRole("heading", { name: dict.checkout.title });
      await fillDelivery(user);
      await user.click(
        await screen.findByRole("radio", {
          name: new RegExp(dict.checkout.payment.onlineTitle),
        }),
      );
      const review = await toReview(user);

      expect(review).toHaveTextContent(
        `${dict.checkout.review.payment}${dict.checkout.payment.onlineTitle}`,
      );
      expect(review).not.toHaveTextContent(dict.checkout.review.email);
    });

    it("links the offer and the privacy policy in a new tab", async () => {
      setupBlankProfile();
      const user = userEvent.setup();
      renderWithProviders(<CheckoutView />, authed);

      await screen.findByRole("heading", { name: dict.checkout.title });
      await fillDelivery(user);
      await toReview(user);

      const offer = screen.getByRole("link", {
        name: new RegExp(dict.checkout.consent.offerLink),
      });
      const privacy = screen.getByRole("link", {
        name: new RegExp(dict.checkout.consent.privacyLink),
      });
      expect(offer).toHaveAttribute("href", "/legal/offer");
      expect(privacy).toHaveAttribute("href", "/legal/privacy-policy");
      for (const link of [offer, privacy]) {
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
      }
      const box = screen.getByRole("checkbox", {
        name: dict.checkout.consent.prefix,
      });
      expect(box).not.toBeChecked();
      expect(box).toHaveAccessibleDescription(
        new RegExp(dict.checkout.consent.offerLink),
      );
    });

    it("blocks the confirm with a visible message — not a disabled button — until the consent is ticked", async () => {
      setupBlankProfile();
      let orderCalls = 0;
      server.use(
        http.post("*/api/orders", () => {
          orderCalls += 1;
          return HttpResponse.json(makeOrder(), { status: 201 });
        }),
      );
      const user = userEvent.setup();
      renderWithProviders(<CheckoutView />, authed);

      await screen.findByRole("heading", { name: dict.checkout.title });
      await fillDelivery(user);
      await toReview(user);

      const confirm = screen.getByRole("button", {
        name: dict.checkout.placeOrder,
      });
      expect(confirm).toBeEnabled();
      expect(
        screen.queryByText(dict.checkout.consent.required),
      ).not.toBeInTheDocument();

      await user.click(confirm);

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(dict.checkout.consent.required);
      const box = screen.getByRole("checkbox", {
        name: dict.checkout.consent.prefix,
      });
      expect(box).toHaveAttribute("aria-invalid", "true");
      expect(box).toHaveAccessibleDescription(
        new RegExp(dict.checkout.consent.required),
      );
      expect(box).toHaveFocus();
      expect(orderCalls).toBe(0);

      // Ticking clears the message; the next press places the order.
      await user.click(box);
      expect(
        screen.queryByText(dict.checkout.consent.required),
      ).not.toBeInTheDocument();
      expect(box).not.toHaveAttribute("aria-invalid");
      await user.click(confirm);
      await waitFor(() => expect(orderCalls).toBe(1));
    });
  });

  // ── TASK-407: validation timing, phone rule, breadcrumbs ───────────────────
  describe("validation timing", () => {
    it("says nothing before the first «Далі» — errors are not the greeting", async () => {
      setupBlankProfile();
      const user = userEvent.setup();
      renderWithProviders(<CheckoutView />, authed);

      await screen.findByRole("heading", { name: dict.checkout.title });

      // Touch a required field and leave it empty; blur alone must stay quiet.
      await user.click(screen.getByLabelText(dict.checkout.fields.firstName));
      await user.tab();

      expect(
        screen.queryByText(dict.checkout.validation.firstName),
      ).not.toBeInTheDocument();
    });

    it("clears an error as soon as the field is fixed, without a second «Далі»", async () => {
      // The regression this test exists for: step 1 ran through a manual
      // `trigger()`, which does not arm RHF's `reValidateMode`. A shopper who
      // pressed «Далі», then filled the field in, kept staring at the same red
      // sentence until they pressed «Далі» again.
      setupBlankProfile();
      const user = userEvent.setup();
      renderWithProviders(<CheckoutView />, authed);

      await screen.findByRole("heading", { name: dict.checkout.title });
      await user.click(
        screen.getByRole("button", { name: dict.checkout.nextStep }),
      );

      expect(
        await screen.findByText(dict.checkout.validation.firstName),
      ).toBeInTheDocument();

      await user.type(
        screen.getByLabelText(dict.checkout.fields.firstName),
        "Олег",
      );

      await waitFor(() =>
        expect(
          screen.queryByText(dict.checkout.validation.firstName),
        ).not.toBeInTheDocument(),
      );
    });

    it("reports a bad phone in Ukrainian, not as the English «Required»", async () => {
      // `CHECKOUT_DEFAULT_VALUES` had no `phone` key, so an untouched field was
      // `undefined` and zod answered with its own English default.
      setupBlankProfile();
      const user = userEvent.setup();
      renderWithProviders(<CheckoutView />, authed);

      await screen.findByRole("heading", { name: dict.checkout.title });
      await user.click(
        screen.getByRole("button", { name: dict.checkout.nextStep }),
      );

      expect(
        await screen.findByText(dict.checkout.validation.phone),
      ).toBeInTheDocument();
      expect(screen.queryByText("Required")).not.toBeInTheDocument();
    });

    it("refuses a half-typed phone number that the old mask-shaped rule accepted", async () => {
      setupBlankProfile();
      const user = userEvent.setup();
      renderWithProviders(<CheckoutView />, authed);

      await screen.findByRole("heading", { name: dict.checkout.title });
      // Six local digits: the mask renders "+380 50 123", which is 11 characters
      // of `[\d\s()-]` and therefore passed the rule this replaced.
      await fillDelivery(user, { phone: "501234" });
      await user.click(
        screen.getByRole("button", { name: dict.checkout.nextStep }),
      );

      expect(
        await screen.findByText(dict.checkout.validation.phone),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: dict.checkout.reviewHeading }),
      ).not.toBeInTheDocument();
    });
  });

  it("offers a way back to the cart from the checkout", async () => {
    setupBlankProfile();
    renderWithProviders(<CheckoutView />, authed);

    await screen.findByRole("heading", { name: dict.checkout.title });

    const crumbs = screen.getByRole("navigation", {
      name: dict.product.breadcrumbAria,
    });
    expect(crumbs).toHaveTextContent(dict.checkout.breadcrumb);
    expect(
      within(crumbs).getByRole("link", { name: dict.checkout.breadcrumbCart }),
    ).toHaveAttribute("href", "/cart");
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

    // Since TASK-338 a guest is a real checkout participant, not a visitor about
    // to be bounced to login — so their funnel entry counts like anyone else's.
    it("reports begin_checkout for a guest too", async () => {
      const track = jest.fn();
      window.umami = { track };
      server.use(http.get("*/api/cart", () => HttpResponse.json(makeCart())));

      renderWithProviders(<CheckoutView />, guest);
      await screen.findByRole("heading", { name: dict.checkout.title });

      await waitFor(() =>
        expect(track).toHaveBeenCalledWith("begin_checkout", { itemCount: 1 }),
      );
    });
  });

  // ── TASK-338: checkout without an account ──────────────────────────────────
  describe("guest checkout", () => {
    it("renders the form for a guest instead of redirecting to login", async () => {
      // The barrier this replaces made the storefront's own "замовлення без
      // реєстрації" promise (plan 102 §5) untrue for as long as it stood.
      server.use(http.get("*/api/cart", () => HttpResponse.json(makeCart())));

      renderWithProviders(<CheckoutView />, guest);

      expect(
        await screen.findByRole("heading", { name: dict.checkout.title }),
      ).toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalledWith("/login?redirect=/checkout");
      expect(
        screen.getByLabelText(dict.checkout.guest.emailLabel),
      ).toBeInTheDocument();
    });

    it("does not ask a signed-in shopper for contact details", async () => {
      // Their account is the source of truth and the backend ignores a contact
      // block from an authenticated caller, so the field would be theatre.
      server.use(http.get("*/api/cart", () => HttpResponse.json(makeCart())));

      renderWithProviders(<CheckoutView />, authed);
      await screen.findByRole("heading", { name: dict.checkout.title });

      expect(
        screen.queryByLabelText(dict.checkout.guest.emailLabel),
      ).not.toBeInTheDocument();
    });

    it("will not advance a guest past step 1 without an email", async () => {
      setupBlankProfile();
      const user = userEvent.setup();
      renderWithProviders(<CheckoutView />, guest);

      await screen.findByRole("heading", { name: dict.checkout.title });
      await fillDelivery(user);
      await user.click(
        screen.getByRole("button", { name: dict.checkout.nextStep }),
      );

      expect(
        await screen.findByText(dict.checkout.guest.validationEmailRequired),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: dict.checkout.reviewHeading }),
      ).not.toBeInTheDocument();
    });

    it("lets a guest complete the order and sends the contact block", async () => {
      let body: { contact?: Record<string, string> } | null = null;
      server.use(
        http.get("*/api/cart", () => HttpResponse.json(makeCart())),
        http.post("*/api/orders", async ({ request }) => {
          body = (await request.json()) as typeof body;
          return HttpResponse.json(makeOrder({ userId: null }), {
            status: 201,
          });
        }),
      );

      const user = userEvent.setup();
      renderWithProviders(<CheckoutView />, guest);

      await screen.findByRole("heading", { name: dict.checkout.title });
      await user.type(
        screen.getByLabelText(dict.checkout.guest.emailLabel),
        "olena@example.com",
      );
      await fillDelivery(user);
      await user.click(
        screen.getByRole("button", { name: dict.checkout.nextStep }),
      );
      await screen.findByRole("heading", { name: dict.checkout.reviewHeading });
      await acceptConsent(user);
      await user.click(
        screen.getByRole("button", { name: dict.checkout.placeOrder }),
      );

      // The order really was placed as a guest, contact and all.
      await waitFor(() => expect(body).not.toBeNull());
      expect(body!.contact).toEqual({
        email: "olena@example.com",
        phone: "+380 50 123 4567",
        name: "Олег Коваль",
      });

      // And they are shown the outcome in place: /orders/[id]/confirmation reads
      // an endpoint behind a JWT, so pushing a guest there would show them a
      // login wall seconds after they ordered.
      expect(
        await screen.findByRole("heading", {
          name: dict.checkout.guest.successHeading,
        }),
      ).toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
      // The account offer comes after the order, never in front of it.
      expect(
        screen.getByRole("link", {
          name: dict.checkout.guest.accountOfferCta,
        }),
      ).toHaveAttribute("href", "/register");

      // TASK-407: the stepper promises three steps, and this screen IS the
      // third one — it used to freeze on step 2 while the order already existed.
      const current = document.querySelector('[aria-current="step"]');
      expect(current).toHaveTextContent("3");
      expect(current?.closest("li")).toHaveTextContent(
        dict.checkout.stepConfirm,
      );
    });
  });

  // ── TASK-330-B: the payment choice has to reach the API ────────────────────
  describe("payment method", () => {
    /** Fill step 1 as a signed-in shopper and place the order. */
    async function placeOrder(user: ReturnType<typeof userEvent.setup>) {
      await screen.findByRole("heading", { name: dict.checkout.title });
      await fillDelivery(user);
      await user.click(
        screen.getByRole("button", { name: dict.checkout.nextStep }),
      );
      await screen.findByRole("heading", { name: dict.checkout.reviewHeading });
      await acceptConsent(user);
      await user.click(
        screen.getByRole("button", { name: dict.checkout.placeOrder }),
      );
    }

    it("opens a real payment attempt and hands the browser off when card is chosen", async () => {
      process.env.NEXT_PUBLIC_PAYMENT_METHODS = "ONLINE";
      const submit = jest
        .spyOn(HTMLFormElement.prototype, "submit")
        .mockImplementation(() => {});
      let checkoutCalls = 0;
      let orderBody: Record<string, unknown> | null = null;

      setupBlankProfile();
      server.use(
        http.post("*/api/orders", async ({ request }) => {
          orderBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(makeOrder(), { status: 201 });
        }),
        http.post("*/api/payments/orders/:orderId/checkout", () => {
          checkoutCalls += 1;
          return HttpResponse.json(
            {
              data: {
                paymentId: "payment-1",
                url: "https://provider.example/checkout",
                method: "POST",
                fields: { data: "BASE64", signature: "SIG" },
              },
            },
            { status: 201 },
          );
        }),
      );

      const user = userEvent.setup();
      renderWithProviders(<CheckoutView />, authed);

      await screen.findByRole("heading", { name: dict.checkout.title });
      await user.click(screen.getByRole("radio", { name: /Картка онлайн/ }));
      await placeOrder(user);

      // This is the whole point of the task: the chosen method reached the API,
      // twice. On the create call as `paymentMethod` — without it the server
      // stores ON_DELIVERY and never starts the stock reservation (TASK-650) —
      // and as the payment-attempt call that opens the provider handoff.
      await waitFor(() => expect(checkoutCalls).toBe(1));
      expect(orderBody).toMatchObject({ paymentMethod: "ONLINE" });
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

      const form = document.querySelector(
        'form[action="https://provider.example/checkout"]',
      );
      expect(form).not.toBeNull();
      // Fields come from the response; the storefront invents none of them.
      expect(
        Array.from(form!.querySelectorAll("input")).map((i) => [
          i.name,
          i.value,
        ]),
      ).toEqual([
        ["data", "BASE64"],
        ["signature", "SIG"],
      ]);

      submit.mockRestore();
    });

    it("does not touch the payment endpoint for cash on delivery", async () => {
      process.env.NEXT_PUBLIC_PAYMENT_METHODS = "ONLINE";
      let checkoutCalls = 0;
      let orderBody: Record<string, unknown> | null = null;

      setupBlankProfile();
      server.use(
        http.post("*/api/orders", async ({ request }) => {
          orderBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(makeOrder(), { status: 201 });
        }),
        http.post("*/api/payments/orders/:orderId/checkout", () => {
          checkoutCalls += 1;
          return HttpResponse.json({ data: {} }, { status: 201 });
        }),
      );

      const user = userEvent.setup();
      renderWithProviders(<CheckoutView />, authed);
      await placeOrder(user);

      await waitFor(() =>
        expect(mockPush).toHaveBeenCalledWith("/orders/order-1/confirmation"),
      );
      expect(checkoutCalls).toBe(0);
      expect(orderBody).toMatchObject({ paymentMethod: "ON_DELIVERY" });
    });

    it("lands on the order page — never a success claim — when the handoff fails", async () => {
      process.env.NEXT_PUBLIC_PAYMENT_METHODS = "ONLINE";
      setupBlankProfile();
      server.use(
        http.post("*/api/orders", () =>
          HttpResponse.json(makeOrder(), { status: 201 }),
        ),
        // 503: the provider has no credentials configured.
        http.post("*/api/payments/orders/:orderId/checkout", () =>
          HttpResponse.json({ message: "unavailable" }, { status: 503 }),
        ),
      );

      const user = userEvent.setup();
      renderWithProviders(<CheckoutView />, authed);

      await screen.findByRole("heading", { name: dict.checkout.title });
      await user.click(screen.getByRole("radio", { name: /Картка онлайн/ }));
      await placeOrder(user);

      // The order exists and is unpaid. The shopper is told about the handoff,
      // and taken to the page that shows the server's real payment status.
      await waitFor(() =>
        expect(mockPush).toHaveBeenCalledWith("/orders/order-1/confirmation"),
      );
    });
  });
});

// ── TASK-773 + TASK-794: a session that expires mid-checkout ─────────────────
// These run the REAL AuthProvider and the real axios interceptor: the defect
// lived in the gap between them (the interceptor dropped its token, the
// context kept `isAuthenticated: true`), which a stubbed context cannot show.
describe("CheckoutView — the session expires mid-checkout (TASK-773, TASK-794)", () => {
  function renderWithRealSession() {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    return render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <CheckoutView />
        </AuthProvider>
      </QueryClientProvider>,
    );
  }

  /** The bootstrap refresh restores a session; every later refresh is a 401. */
  function sessionThatExpires() {
    let refreshCalls = 0;
    server.use(
      http.post("*/api/auth/refresh", () => {
        refreshCalls += 1;
        return refreshCalls === 1
          ? HttpResponse.json({ data: { accessToken: "header.payload.sig" } })
          : HttpResponse.json({ message: "Unauthorized" }, { status: 401 });
      }),
      http.get("*/api/cart", () => HttpResponse.json(makeCart())),
    );
  }

  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
    delete process.env.NEXT_PUBLIC_PAYMENT_METHODS;
    setAccessToken(null);
    markSessionActive();
  });

  afterEach(() => {
    setAccessToken(null);
    clearSessionMarker();
  });

  it("shows the guest contact block once the refresh fails", async () => {
    sessionThatExpires();
    // The profile prefill is the first authenticated call — its 401 is what
    // sends the interceptor to a refresh that no longer works.
    server.use(
      http.get("*/api/users/me", () =>
        HttpResponse.json({ message: "Unauthorized" }, { status: 401 }),
      ),
    );

    renderWithRealSession();

    await screen.findByRole("heading", { name: dict.checkout.title });
    // Before TASK-773 the context stayed signed in and this field never came.
    expect(
      await screen.findByLabelText(dict.checkout.guest.emailLabel),
    ).toBeInTheDocument();
  });

  it("sends a blocked review-step submit back to the field that blocks it", async () => {
    sessionThatExpires();
    let orderCalls = 0;
    server.use(
      http.get("*/api/users/me", () =>
        HttpResponse.json(makeUser({ firstName: "", lastName: "", phone: "" })),
      ),
      // The session dies exactly here: the order POST earns a 401 and the
      // refresh behind it fails.
      http.post("*/api/orders", () => {
        orderCalls += 1;
        return HttpResponse.json({ message: "Unauthorized" }, { status: 401 });
      }),
    );

    const user = userEvent.setup();
    renderWithRealSession();

    await screen.findByRole("heading", { name: dict.checkout.title });
    // Signed in: no email field on step 1.
    await waitFor(() =>
      expect(screen.getByLabelText(dict.checkout.fields.firstName)).toHaveValue(
        "",
      ),
    );
    expect(
      screen.queryByLabelText(dict.checkout.guest.emailLabel),
    ).not.toBeInTheDocument();
    await fillDelivery(user);
    await user.click(
      screen.getByRole("button", { name: dict.checkout.nextStep }),
    );
    await screen.findByRole("heading", { name: dict.checkout.reviewHeading });

    await acceptConsent(user);
    await user.click(
      screen.getByRole("button", { name: dict.checkout.placeOrder }),
    );
    await waitFor(() => expect(orderCalls).toBe(1));

    // Now a guest, whose schema requires an email that step 2 does not render.
    // The second press used to do nothing at all — the silent button.
    await user.click(
      await screen.findByRole("button", { name: dict.checkout.placeOrder }),
    );

    expect(
      await screen.findByText(dict.checkout.guest.validationEmailRequired),
    ).toBeInTheDocument();
    const email = screen.getByLabelText(dict.checkout.guest.emailLabel);
    await waitFor(() => expect(email).toHaveFocus());
    expect(orderCalls).toBe(1);
  });

  it("falls back to cash on delivery when the chosen online method is no longer available", async () => {
    process.env.NEXT_PUBLIC_PAYMENT_METHODS = "ONLINE";
    sessionThatExpires();
    server.use(
      http.get("*/api/users/me", () => HttpResponse.json(makeUser())),
      http.get("*/api/protected", () =>
        HttpResponse.json({ message: "Unauthorized" }, { status: 401 }),
      ),
    );

    const user = userEvent.setup();
    renderWithRealSession();

    await screen.findByRole("heading", { name: dict.checkout.title });
    const online = await screen.findByRole("radio", { name: /Картка онлайн/ });
    await waitFor(() => expect(online).toBeEnabled());
    await user.click(online);
    expect(online).toBeChecked();

    // Any authenticated call can be the one that finds the session gone.
    await act(async () => {
      await expect(api.get("/api/protected")).rejects.toBeTruthy();
    });

    await waitFor(() => expect(online).toBeDisabled());
    await waitFor(() =>
      expect(
        screen.getByRole("radio", {
          name: new RegExp(dict.checkout.payment.onDeliveryTitle),
        }),
      ).toBeChecked(),
    );
    expect(online).not.toBeChecked();
  });
});
