import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeCart, makeCartItem } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import { CartView } from "./cart-view";

describe("CartView", () => {
  it("renders an error alert and retry button when the cart fails to load", async () => {
    server.use(
      http.get("*/api/cart", () => HttpResponse.json({}, { status: 500 })),
    );

    renderWithProviders(<CartView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.cart.loadError,
    );
    expect(
      screen.getByRole("button", { name: dict.common.retry }),
    ).toBeInTheDocument();
  });

  it("renders the empty state when the cart has no items", async () => {
    server.use(http.get("*/api/cart", () => HttpResponse.json(makeCart([]))));

    renderWithProviders(<CartView />);

    expect(await screen.findByText(dict.cart.emptyHeading)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.cart.shopNow }),
    ).toHaveAttribute("href", "/products");
  });

  it("renders the line items and summary for a populated cart", async () => {
    server.use(
      http.get("*/api/cart", () =>
        HttpResponse.json(
          makeCart([makeCartItem({ productName: "Magic Cable" })]),
        ),
      ),
    );

    renderWithProviders(<CartView />);

    expect(await screen.findByText("Magic Cable")).toBeInTheDocument();
    expect(screen.getByText(dict.cart.summaryHeading)).toBeInTheDocument();
  });

  it("clears the cart after confirming the dialog", async () => {
    const user = userEvent.setup();
    let cleared = false;
    server.use(
      http.get("*/api/cart", () =>
        HttpResponse.json(makeCart([makeCartItem({ productName: "Doomed" })])),
      ),
      http.delete("*/api/cart", () => {
        cleared = true;
        return HttpResponse.json({ data: {} });
      }),
    );

    renderWithProviders(<CartView />);
    await screen.findByText("Doomed");

    await user.click(screen.getByRole("button", { name: dict.cart.clear }));
    const confirm = await screen.findByRole("button", {
      name: dict.cart.clearConfirmAction,
    });
    await user.click(confirm);

    await waitFor(() => expect(cleared).toBe(true));
  });

  it("blocks checkout while the cart holds a withdrawn line (TASK-403)", async () => {
    server.use(
      http.get("*/api/cart", () =>
        HttpResponse.json(
          makeCart([
            makeCartItem({ id: "a", productName: "Живий товар" }),
            makeCartItem({
              id: "b",
              productName: "Знятий товар",
              isActive: false,
            }),
          ]),
        ),
      ),
    );

    renderWithProviders(<CartView />);
    await screen.findByText("Знятий товар");

    expect(screen.getByText(dict.cart.unavailable)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: dict.cart.checkoutAria }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.cart.checkout }),
    ).toBeDisabled();
    expect(screen.getByText(dict.cart.checkoutBlocked)).toBeInTheDocument();
  });
});
