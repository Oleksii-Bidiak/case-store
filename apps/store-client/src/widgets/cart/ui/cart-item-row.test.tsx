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
    const item = makeCartItem({ id: "item-42", quantity: 2, maxQty: 50 });
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
    const item = makeCartItem({ id: "item-9", quantity: 2, maxQty: 50 });
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
    const item = makeCartItem({ id: "item-1", quantity: 2, maxQty: 50 });
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
    const item = makeCartItem({ id: "item-1", quantity: 2, maxQty: 50 });
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
    const item = makeCartItem({ id: "item-1", quantity: 2, maxQty: 50 });
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

  // ─── manual clear restores previous quantity (TASK-207) ───────────────────
  it("shows an empty field (not «0») while the input is cleared", () => {
    const item = makeCartItem({ id: "item-1", quantity: 2, maxQty: 50 });

    renderWithProviders(<CartItemRow item={item} />);
    const input = screen.getByLabelText(dict.cart.quantityAria);
    fireEvent.change(input, { target: { value: "" } });

    expect(input).toHaveValue(null);
  });

  it("restores the previous quantity on blur after a manual clear", () => {
    jest.useFakeTimers();
    const item = makeCartItem({ id: "item-1", quantity: 2, maxQty: 50 });
    let patchCount = 0;
    let deleteCount = 0;
    server.use(
      http.patch("*/api/cart/items/:itemId", () => {
        patchCount += 1;
        return HttpResponse.json({ data: {} });
      }),
      http.delete("*/api/cart/items/:itemId", () => {
        deleteCount += 1;
        return HttpResponse.json({ data: {} });
      }),
    );

    renderWithProviders(<CartItemRow item={item} />);
    const input = screen.getByLabelText(dict.cart.quantityAria);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    // The previous quantity is back and no server write was dispatched, even
    // after the debounce window.
    expect(input).toHaveValue(2);
    jest.advanceTimersByTime(400);
    expect(patchCount).toBe(0);
    expect(deleteCount).toBe(0);
  });

  it("restores the previous quantity when 0 is typed (no removal)", () => {
    jest.useFakeTimers();
    const item = makeCartItem({ id: "item-1", quantity: 3, maxQty: 50 });
    let deleteCount = 0;
    server.use(
      http.delete("*/api/cart/items/:itemId", () => {
        deleteCount += 1;
        return HttpResponse.json({ data: {} });
      }),
    );

    renderWithProviders(<CartItemRow item={item} />);
    const input = screen.getByLabelText(dict.cart.quantityAria);
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);

    expect(input).toHaveValue(3);
    jest.advanceTimersByTime(400);
    expect(deleteCount).toBe(0);
  });

  it("caps the increase button at the position's available stock", () => {
    const item = makeCartItem({ maxQty: 3, quantity: 3 });

    renderWithProviders(<CartItemRow item={item} />);

    expect(
      screen.getByRole("button", { name: dict.cart.increaseAria }),
    ).toBeDisabled();
  });

  it("disables the increase button for an out-of-stock position", () => {
    const item = makeCartItem({ maxQty: 0, quantity: 1 });

    renderWithProviders(<CartItemRow item={item} />);

    expect(
      screen.getByRole("button", { name: dict.cart.increaseAria }),
    ).toBeDisabled();
  });

  // ─── image + product link (TASK-133) ──────────────────────────────────────
  it("renders the real product image and links the line to the PDP", () => {
    const item = makeCartItem({
      productName: "Linked Item",
      productSlug: "linked-item",
      imageUrl: "https://cdn.example.com/linked-item.jpg",
    });

    renderWithProviders(<CartItemRow item={item} />);

    const link = screen.getByRole("link", {
      name: dict.cart.viewProductAria("Linked Item"),
    });
    expect(link).toHaveAttribute("href", "/products/linked-item");

    // `next/image` rewrites the src to the optimizer URL; the original URL is
    // carried in the encoded `url` query param.
    const img = screen.getByRole("img", { name: "Linked Item" });
    expect(img).toHaveAttribute(
      "src",
      expect.stringContaining(
        encodeURIComponent("https://cdn.example.com/linked-item.jpg"),
      ),
    );
  });

  it("falls back to the placeholder thumbnail when there is no image", () => {
    const item = makeCartItem({
      productName: "No Image Item",
      productSlug: "no-image-item",
      imageUrl: null,
    });

    renderWithProviders(<CartItemRow item={item} />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.getByRole("link", {
        name: dict.cart.viewProductAria("No Image Item"),
      }),
    ).toHaveAttribute("href", "/products/no-image-item");
  });

  // ─── product name link + mini-cart close (TASK-204) ───────────────────────
  it("links the product name to the same PDP as the image", () => {
    const item = makeCartItem({
      productName: "Named Item",
      productSlug: "named-item",
    });

    renderWithProviders(<CartItemRow item={item} />);

    const nameLink = screen.getByRole("link", { name: "Named Item" });
    expect(nameLink).toHaveAttribute("href", "/products/named-item");
    // Image link and name link must always agree on the destination.
    expect(
      screen.getByRole("link", {
        name: dict.cart.viewProductAria("Named Item"),
      }),
    ).toHaveAttribute("href", "/products/named-item");
  });

  it("notifies onNavigate when a product link is clicked (mini-cart close)", () => {
    const item = makeCartItem({
      productName: "Sheet Item",
      productSlug: "sheet-item",
    });
    const onNavigate = jest.fn();

    renderWithProviders(<CartItemRow item={item} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("link", { name: "Sheet Item" }));
    fireEvent.click(
      screen.getByRole("link", {
        name: dict.cart.viewProductAria("Sheet Item"),
      }),
    );

    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("falls back to the placeholder thumbnail after the image errors", () => {
    const item = makeCartItem({
      productName: "Broken Image",
      imageUrl: "https://cdn.example.com/broken.jpg",
    });

    renderWithProviders(<CartItemRow item={item} />);

    fireEvent.error(screen.getByRole("img", { name: "Broken Image" }));

    expect(screen.queryByRole("img")).toBeNull();
  });
});
