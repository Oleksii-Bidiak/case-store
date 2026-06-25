import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  fireEvent,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeCartItem } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import { CartItemRow } from "./cart-item-row";

describe("CartItemRow", () => {
  afterEach(() => jest.useRealTimers());

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

  it("updates the counter on the first click, before the server write fires", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const item = makeCartItem({ id: "item-1", quantity: 2, stock: 50 });
    let patchCount = 0;
    server.use(
      http.patch("*/api/cart/items/:itemId", () => {
        patchCount += 1;
        return HttpResponse.json({ data: {} });
      }),
    );

    renderWithProviders(<CartItemRow item={item} />);
    await user.click(
      screen.getByRole("button", { name: dict.cart.increaseAria }),
    );

    // Optimistic: the counter reflects the new value immediately, and the
    // (debounced) server write has not fired yet.
    expect(screen.getByLabelText(dict.cart.quantityAria)).toHaveValue(3);
    expect(patchCount).toBe(0);
  });

  it("collapses rapid clicks into a single PATCH for the final quantity", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const item = makeCartItem({ id: "item-1", quantity: 2, stock: 50 });
    let patchCount = 0;
    let lastBody: { quantity?: number } | null = null;
    server.use(
      http.patch("*/api/cart/items/:itemId", async ({ request }) => {
        patchCount += 1;
        lastBody = (await request.json()) as { quantity?: number };
        return HttpResponse.json({ data: {} });
      }),
    );

    renderWithProviders(<CartItemRow item={item} />);
    const increase = screen.getByRole("button", {
      name: dict.cart.increaseAria,
    });
    await user.click(increase);
    await user.click(increase);
    await user.click(increase);

    // Three optimistic increments, no server write yet.
    expect(screen.getByLabelText(dict.cart.quantityAria)).toHaveValue(5);
    expect(patchCount).toBe(0);

    // Fire the debounce, then let the real-timer async flush settle the request.
    jest.advanceTimersByTime(300);
    jest.useRealTimers();

    await waitFor(() => expect(patchCount).toBe(1));
    expect(lastBody).toEqual({ quantity: 5 });
  });

  it("writes a manually typed quantity to the server on blur", async () => {
    const item = makeCartItem({ id: "item-1", quantity: 2, stock: 50 });
    let lastBody: { quantity?: number } | null = null;
    server.use(
      http.patch("*/api/cart/items/:itemId", async ({ request }) => {
        lastBody = (await request.json()) as { quantity?: number };
        return HttpResponse.json({ data: {} });
      }),
    );

    renderWithProviders(<CartItemRow item={item} />);
    const input = screen.getByLabelText(dict.cart.quantityAria);
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.blur(input);

    await waitFor(() => expect(lastBody).toEqual({ quantity: 7 }));
  });

  it("caps the increase button at the position's available stock", () => {
    const item = makeCartItem({ stock: 3, quantity: 3 });

    renderWithProviders(<CartItemRow item={item} />);

    expect(
      screen.getByRole("button", { name: dict.cart.increaseAria }),
    ).toBeDisabled();
  });

  it("disables the increase button for an out-of-stock position", () => {
    const item = makeCartItem({ stock: 0, quantity: 1 });

    renderWithProviders(<CartItemRow item={item} />);

    expect(
      screen.getByRole("button", { name: dict.cart.increaseAria }),
    ).toBeDisabled();
  });
});
