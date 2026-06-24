import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeCart } from "@/shared/test/msw-handlers";
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
    expect(
      screen.getByRole("button", { name: dict.checkout.placeOrder }),
    ).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // TASK-119 regression: the backend empties the cart on order creation. The
  // post-order cart refetch must NOT trigger the empty-cart guard's
  // `router.replace("/cart")` and overwrite the push to the confirmation page.
  it("pushes to the confirmation page on success and does not redirect to /cart when the cart empties", async () => {
    let orderPlaced = false;
    server.use(
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
    await user.type(
      screen.getByLabelText(dict.checkout.fields.phone),
      "+380501234567",
    );
    await user.type(screen.getByLabelText(dict.checkout.fields.city), "Київ");
    await user.type(
      screen.getByLabelText(dict.checkout.fields.deliveryAddress),
      "Відділення №1",
    );

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
});
