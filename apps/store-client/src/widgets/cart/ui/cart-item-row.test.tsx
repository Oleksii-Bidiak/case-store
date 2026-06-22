import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeCartItem } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import { CartItemRow } from "./cart-item-row";

describe("CartItemRow", () => {
  it("renders the product name and quantity", () => {
    const item = makeCartItem({ productName: "Test Product", quantity: 2 });

    renderWithProviders(<CartItemRow item={item} />);

    expect(screen.getByText("Test Product")).toBeInTheDocument();
    expect(screen.getByLabelText(dict.cart.quantityAria)).toHaveValue(2);
  });

  it("fires an update-cart-item mutation when increasing quantity", async () => {
    const user = userEvent.setup();
    const item = makeCartItem({ id: "item-42", quantity: 2, stock: 50 });
    let patchedBody: { quantity?: number } | null = null;
    server.use(
      http.patch("*/api/cart/items/:itemId", async ({ request, params }) => {
        expect(params.itemId).toBe("item-42");
        patchedBody = (await request.json()) as { quantity?: number };
        return HttpResponse.json({ data: {} });
      }),
    );

    renderWithProviders(<CartItemRow item={item} />);
    await user.click(
      screen.getByRole("button", { name: dict.cart.increaseAria }),
    );

    await waitFor(() => expect(patchedBody).toEqual({ quantity: 3 }));
  });

  it("fires a remove-cart-item mutation when clicking remove", async () => {
    const user = userEvent.setup();
    const item = makeCartItem({ id: "item-7", productName: "Doomed Item" });
    let removedId: string | null = null;
    server.use(
      http.delete("*/api/cart/items/:itemId", ({ params }) => {
        removedId = params.itemId as string;
        return HttpResponse.json({ data: {} });
      }),
    );

    renderWithProviders(<CartItemRow item={item} />);
    await user.click(
      screen.getByRole("button", {
        name: dict.cart.removeNamedAria("Doomed Item"),
      }),
    );

    await waitFor(() => expect(removedId).toBe("item-7"));
  });

  it("shows an error alert when the update fails", async () => {
    const user = userEvent.setup();
    const item = makeCartItem({ id: "item-9", quantity: 2, stock: 50 });
    server.use(
      http.patch("*/api/cart/items/:itemId", () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );

    renderWithProviders(<CartItemRow item={item} />);
    await user.click(
      screen.getByRole("button", { name: dict.cart.increaseAria }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.cart.updateError,
    );
  });
});
