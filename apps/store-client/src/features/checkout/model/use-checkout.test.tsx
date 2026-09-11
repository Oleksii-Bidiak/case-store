import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { useCheckout } from "./use-checkout";
import type { CheckoutFormValues } from "./checkout-schema";

// next/navigation is unavailable under jsdom — mock the router. Names are
// `mock`-prefixed so jest allows them inside the hoisted factory.
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

const authed = {
  auth: { isAuthenticated: true, accessToken: "token" },
} as const;

const VALUES: CheckoutFormValues = {
  firstName: "Олег",
  lastName: "Коваль",
  phone: "+380501234567",
  city: "м. Київ, Київська обл.",
  npCityRef: "city-ref-1",
  deliveryAddress: "Відділення №1",
  npWarehouseRef: "wh-ref-1",
  notes: "",
  email: "",
  paymentMethod: "ON_DELIVERY",
};

/**
 * Minimal harness: one button that submits a fixed, already-valid form, and the
 * hook's `errorMessage` rendered as-is. The whole point of this suite is what
 * that string says — the full form is `checkout-view.test.tsx`'s job.
 */
function Harness() {
  const { submitOrder, errorMessage } = useCheckout({ isGuest: false });
  return (
    <div>
      <button type="button" onClick={() => void submitOrder(VALUES)}>
        submit
      </button>
      {errorMessage && <p role="alert">{errorMessage}</p>}
    </div>
  );
}

/** Reject order creation with the API's own envelope. */
function createOrderFails(status: number, message?: string) {
  server.use(
    http.post("*/api/orders", () =>
      HttpResponse.json({ statusCode: status, message }, { status }),
    ),
  );
}

describe("useCheckout — order-creation failures (TASK-402)", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  // `order.service.ts` is the checkout backstop: it names the exact line that
  // blocked the order. Collapsing that into "деякі товари можуть бути
  // недоступні" leaves the shopper to guess which of eight items to remove.
  it("shows the API's own sentence on a 400, because it names the item", async () => {
    createOrderFails(
      400,
      'Product "Чохол iPhone 15 Pro" is no longer available',
    );
    const user = userEvent.setup();
    renderWithProviders(<Harness />, authed);

    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(
      await screen.findByText(
        'Product "Чохол iPhone 15 Pro" is no longer available',
      ),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("joins the ValidationPipe's array of messages", async () => {
    server.use(
      http.post("*/api/orders", () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: [
              "phone must be a valid phone number",
              "city should not be empty",
            ],
          },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<Harness />, authed);

    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(
      await screen.findByText(/phone must be a valid phone number/),
    ).toBeInTheDocument();
  });

  it("falls back to the localized constant when the 400 carries no message", async () => {
    createOrderFails(400);
    const user = userEvent.setup();
    renderWithProviders(<Harness />, authed);

    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(await screen.findByText(dict.checkout.error400)).toBeInTheDocument();
  });

  it("keeps the generic message for a 5xx — that body is not shopper copy", async () => {
    createOrderFails(500, "Internal server error");
    const user = userEvent.setup();
    renderWithProviders(<Harness />, authed);

    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(
      await screen.findByText(dict.common.genericError),
    ).toBeInTheDocument();
    expect(screen.queryByText("Internal server error")).toBeNull();
  });
});
