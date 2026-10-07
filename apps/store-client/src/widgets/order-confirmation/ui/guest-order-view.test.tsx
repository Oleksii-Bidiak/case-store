import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, within } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeOrder } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import { GuestOrderView } from "./guest-order-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/orders/guest/token-1",
}));

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
