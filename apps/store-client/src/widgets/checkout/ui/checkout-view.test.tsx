import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
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
});
