import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
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
    expect(screen.getByText(dict.cart.summaryTitle)).toBeInTheDocument();
  });
});
