import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import {
  renderWithProviders,
  screen,
  waitFor,
  fireEvent,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeCart, makeCartItem } from "@/shared/test/msw-handlers";
import { getGetCartQueryKey, type GetCart200 } from "@/entities/cart";
import { dict } from "@/shared/config";
import { Toaster } from "@/shared/ui";
import { CartItemRow } from "./cart-item-row";

/**
 * TASK-418 is the storefront's first toast with an ACTION, so the undo tests
 * render the REAL `<Toaster/>` and click the real button — a mocked-away toast
 * would prove nothing about the affordance a shopper actually gets.
 *
 * `toast` is additionally wrapped in a spy, because one property cannot be
 * observed through the DOM here: the 8-second lifetime. Sonner schedules that
 * dismissal with `setTimeout`, and this suite cannot run MSW under fake timers
 * (see the debounce tests, which have to switch back to real timers to let a
 * request settle), so the lifetime is asserted on the call instead.
 */
jest.mock("sonner", () => {
  const actual = jest.requireActual<typeof import("sonner")>("sonner");
  const spy = Object.assign(
    jest.fn((...args: Parameters<typeof actual.toast>) =>
      actual.toast(...args),
    ),
    actual.toast,
  );
  return { ...actual, toast: spy };
});

const toastSpy = toast as unknown as jest.Mock;

describe("CartItemRow", () => {
  afterEach(() => {
    jest.useRealTimers();
    toastSpy.mockClear();
  });

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

  // ─── recalculation while typing (TASK-418) ────────────────────────────────
  // The stepper has always recalculated on the click; the typed field did not,
  // and waited for blur. A shopper who typed «5» saw the old money and read it
  // as "the cart ignored me".
  it("recalculates the line and the cart totals on the keystroke, before any blur", () => {
    jest.useFakeTimers();
    const item = makeCartItem({
      id: "item-1",
      quantity: 2,
      price: "499.00",
      maxQty: 50,
    });

    const { queryClient } = renderWithProviders(<CartItemRow item={item} />);
    queryClient.setQueryData(getGetCartQueryKey(), makeCart([item]));

    fireEvent.change(screen.getByLabelText(dict.cart.quantityAria), {
      target: { value: "5" },
    });

    const cart = queryClient.getQueryData<GetCart200>(getGetCartQueryKey());
    expect(cart?.data?.items[0].lineTotal).toBe("2495.00");
    expect(cart?.data?.totals.subtotal).toBe("2495.00");
    expect(cart?.data?.totals.itemCount).toBe(5);
  });

  it("still writes a typed quantity on the one 300 ms debounce, blur or not", async () => {
    jest.useFakeTimers();
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
    const input = screen.getByLabelText(dict.cart.quantityAria);
    // Typing «12» one digit at a time: recalculating per keystroke must not
    // turn into one request per keystroke.
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.change(input, { target: { value: "12" } });

    expect(patchCount).toBe(0);

    jest.advanceTimersByTime(300);
    jest.useRealTimers();

    await waitFor(() => expect(patchCount).toBe(1));
    expect(lastBody).toEqual({ quantity: 12 });
  });

  it("leaves the money alone while the field is transiently empty", () => {
    jest.useFakeTimers();
    const item = makeCartItem({
      id: "item-1",
      quantity: 2,
      price: "499.00",
      maxQty: 50,
    });

    const { queryClient } = renderWithProviders(<CartItemRow item={item} />);
    queryClient.setQueryData(getGetCartQueryKey(), makeCart([item]));

    fireEvent.change(screen.getByLabelText(dict.cart.quantityAria), {
      target: { value: "" },
    });

    // An empty field is a user mid-edit, not an order for zero (TASK-207).
    const cart = queryClient.getQueryData<GetCart200>(getGetCartQueryKey());
    expect(cart?.data?.items[0].quantity).toBe(2);
    expect(cart?.data?.totals.subtotal).toBe("998.00");
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

  // ─── Add-on services (TASK-174) ───────────────────────────────────────────

  describe("add-on services", () => {
    const warranty = {
      addonServiceId: "svc-warranty",
      name: "Гарантійний сертифікат",
      description: null,
      price: "499.00",
      source: "template" as const,
    };
    const insurance = {
      addonServiceId: "svc-insurance",
      name: "Страхування",
      description: null,
      price: "899.00",
      source: "override" as const,
    };

    it("renders the SERVER-RESOLVED add-ons for the line, with their effective prices", () => {
      const item = makeCartItem({ availableAddons: [warranty, insurance] });

      renderWithProviders(<CartItemRow item={item} showAddons />);

      expect(screen.getByText(dict.cart.offersHeading)).toBeInTheDocument();
      expect(screen.getByText(warranty.name)).toBeInTheDocument();
      // The overridden price, not any catalog default.
      expect(screen.getByText(insurance.name)).toBeInTheDocument();
      expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    });

    it("hides the offers block entirely when the host does not opt in (mini-cart)", () => {
      const item = makeCartItem({ availableAddons: [warranty] });

      renderWithProviders(<CartItemRow item={item} />);

      expect(
        screen.queryByText(dict.cart.offersHeading),
      ).not.toBeInTheDocument();
    });

    it("hides the block when the product has no applicable add-ons", () => {
      renderWithProviders(<CartItemRow item={makeCartItem()} showAddons />);

      expect(
        screen.queryByText(dict.cart.offersHeading),
      ).not.toBeInTheDocument();
    });

    it("reflects the persisted selection — a selected add-on renders checked", () => {
      const item = makeCartItem({
        availableAddons: [warranty, insurance],
        selectedAddonIds: ["svc-insurance"],
      });

      renderWithProviders(<CartItemRow item={item} showAddons />);

      const [warrantyBox, insuranceBox] = screen.getAllByRole("checkbox");
      expect(warrantyBox).not.toBeChecked();
      expect(insuranceBox).toBeChecked();
    });

    it("POSTs the selection when an unselected add-on is checked", async () => {
      const user = userEvent.setup();
      const item = makeCartItem({ id: "item-42", availableAddons: [warranty] });
      let selected: { itemId?: string; addonServiceId?: string } | null = null;
      server.use(
        http.post(
          "*/api/cart/items/:itemId/addons/:addonServiceId",
          ({ params }) => {
            selected = {
              itemId: params.itemId as string,
              addonServiceId: params.addonServiceId as string,
            };
            return HttpResponse.json({ data: {} });
          },
        ),
      );

      renderWithProviders(<CartItemRow item={item} showAddons />);
      await user.click(screen.getByRole("checkbox"));

      await waitFor(() =>
        expect(selected).toEqual({
          itemId: "item-42",
          addonServiceId: "svc-warranty",
        }),
      );
    });

    it("DELETEs the selection when an already-selected add-on is unchecked", async () => {
      const user = userEvent.setup();
      const item = makeCartItem({
        id: "item-42",
        availableAddons: [warranty],
        selectedAddonIds: ["svc-warranty"],
      });
      let deselected: { addonServiceId?: string } | null = null;
      server.use(
        http.delete(
          "*/api/cart/items/:itemId/addons/:addonServiceId",
          ({ params }) => {
            deselected = { addonServiceId: params.addonServiceId as string };
            return HttpResponse.json({ data: {} });
          },
        ),
      );

      renderWithProviders(<CartItemRow item={item} showAddons />);
      await user.click(screen.getByRole("checkbox"));

      await waitFor(() =>
        expect(deselected).toEqual({ addonServiceId: "svc-warranty" }),
      );
    });

    it("surfaces an error when the server rejects the selection", async () => {
      const user = userEvent.setup();
      const item = makeCartItem({ availableAddons: [warranty] });
      server.use(
        http.post("*/api/cart/items/:itemId/addons/:addonServiceId", () =>
          HttpResponse.json({ message: "not available" }, { status: 400 }),
        ),
      );

      renderWithProviders(<CartItemRow item={item} showAddons />);
      await user.click(screen.getByRole("checkbox"));

      expect(
        await screen.findByText(dict.cart.addons.toggleError),
      ).toBeInTheDocument();
    });
  });

  // TASK-403: the API marks a line `isActive: false` when the product — or its
  // category — is withdrawn from sale while it sits in the cart. Until now the
  // storefront read only `maxQty`, so a withdrawn line looked ordinary and the
  // shopper only learned the truth when the order was refused.
  describe("withdrawn from sale (TASK-403)", () => {
    const warranty = {
      addonServiceId: "svc-warranty",
      name: "Гарантійний сертифікат",
      description: null,
      price: "499.00",
      source: "template" as const,
    };

    it("marks the line unavailable instead of showing a stock state", () => {
      // maxQty is healthy: this is NOT an out-of-stock line, and saying so would
      // promise a restock that is never coming.
      const item = makeCartItem({ isActive: false, maxQty: 50 });

      renderWithProviders(<CartItemRow item={item} />);

      expect(screen.getByText(dict.cart.unavailable)).toBeInTheDocument();
      expect(screen.getByText(dict.cart.unavailableNote)).toBeInTheDocument();
      expect(screen.queryByText(dict.cart.inStock)).not.toBeInTheDocument();
      expect(screen.queryByText(dict.cart.outOfStock)).not.toBeInTheDocument();
    });

    it("disables the whole quantity stepper", () => {
      const item = makeCartItem({ isActive: false, quantity: 2, maxQty: 50 });

      renderWithProviders(<CartItemRow item={item} />);

      expect(
        screen.getByRole("button", { name: dict.cart.decreaseAria }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: dict.cart.increaseAria }),
      ).toBeDisabled();
      expect(screen.getByLabelText(dict.cart.quantityAria)).toBeDisabled();
    });

    it("writes nothing to the server when the disabled stepper is clicked", async () => {
      const user = userEvent.setup();
      const item = makeCartItem({ isActive: false, quantity: 2, maxQty: 50 });
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

      expect(patchCount).toBe(0);
      expect(screen.getByLabelText(dict.cart.quantityAria)).toHaveValue(2);
    });

    it("removes the line through the explicit «Прибрати» CTA", async () => {
      const user = userEvent.setup();
      const item = makeCartItem({
        id: "item-77",
        isActive: false,
        productName: "Знятий кейс",
      });
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
          name: dict.cart.unavailableRemoveAria("Знятий кейс"),
        }),
      );

      await waitFor(() => expect(removedId).toBe("item-77"));
    });

    it("stops upselling add-ons on a line that can no longer be ordered", () => {
      const item = makeCartItem({
        isActive: false,
        availableAddons: [warranty],
      });

      renderWithProviders(<CartItemRow item={item} showAddons />);

      expect(
        screen.queryByText(dict.cart.offersHeading),
      ).not.toBeInTheDocument();
    });

    it("leaves an active line exactly as it was", () => {
      renderWithProviders(<CartItemRow item={makeCartItem()} />);

      expect(screen.queryByText(dict.cart.unavailable)).not.toBeInTheDocument();
      expect(screen.getByText(dict.cart.inStock)).toBeInTheDocument();
      expect(screen.getByLabelText(dict.cart.quantityAria)).toBeEnabled();
      expect(
        screen.getByRole("button", { name: dict.cart.increaseAria }),
      ).toBeEnabled();
    });
  });

  // ─── undo after removal (TASK-418) ────────────────────────────────────────
  // Removal is one click with no confirmation dialog. The way back is the
  // toast, not a modal in front of every deletion.
  describe("undo after removal", () => {
    const warranty = {
      addonServiceId: "svc-warranty",
      name: "Гарантійний сертифікат",
      description: null,
      price: "499.00",
      source: "template" as const,
    };
    const insurance = {
      addonServiceId: "svc-insurance",
      name: "Страхування",
      description: null,
      price: "899.00",
      source: "override" as const,
    };

    /** A DELETE that succeeds, so the undo offer is reached. */
    const removalSucceeds = () =>
      server.use(
        http.delete("*/api/cart/items/:itemId", () =>
          HttpResponse.json(makeCart([])),
        ),
      );

    it("offers «Повернути» once the line is gone", async () => {
      const user = userEvent.setup();
      removalSucceeds();

      renderWithProviders(
        <>
          <CartItemRow
            item={makeCartItem({ id: "item-7", productName: "Doomed Item" })}
          />
          <Toaster />
        </>,
      );
      await user.click(
        screen.getByRole("button", {
          name: dict.cart.removeNamedAria("Doomed Item"),
        }),
      );

      expect(
        await screen.findByText(dict.cart.removedToast("Doomed Item")),
      ).toBeInTheDocument();
      const undo = await screen.findByRole("button", {
        name: dict.cart.undoRemove,
      });
      expect(undo).toBeInTheDocument();
      // The mini-cart sheet is a modal Radix dialog and parks
      // `pointer-events: none` on <body>; without this class the button is on
      // screen and refuses every click (see the comment on the toast call).
      expect(undo.closest("[data-sonner-toast]")).toHaveClass(
        "pointer-events-auto",
      );
    });

    it("asks for an 8-second offer — long enough to notice, short enough to expire", async () => {
      const user = userEvent.setup();
      removalSucceeds();

      renderWithProviders(
        <>
          <CartItemRow
            item={makeCartItem({ id: "item-7", productName: "Doomed Item" })}
          />
          <Toaster />
        </>,
      );
      await user.click(
        screen.getByRole("button", {
          name: dict.cart.removeNamedAria("Doomed Item"),
        }),
      );
      await screen.findByRole("button", { name: dict.cart.undoRemove });

      expect(toastSpy).toHaveBeenCalledWith(
        dict.cart.removedToast("Doomed Item"),
        expect.objectContaining({ duration: 8000 }),
      );
    });

    it("re-adds the line with the SAME add-ons, after the row itself is gone", async () => {
      const user = userEvent.setup();
      const item = makeCartItem({
        id: "item-7",
        productId: "product-9",
        productName: "Doomed Item",
        quantity: 3,
        availableAddons: [warranty, insurance],
        selectedAddonIds: ["svc-warranty", "svc-insurance"],
      });
      let addBody: { productId?: string; quantity?: number } | null = null;
      const reselected: string[] = [];
      removalSucceeds();
      server.use(
        http.post("*/api/cart/items", async ({ request }) => {
          addBody = (await request.json()) as {
            productId?: string;
            quantity?: number;
          };
          // The restored line is a NEW row: the old id died with the DELETE.
          return HttpResponse.json(
            makeCart([
              makeCartItem({
                id: "item-99",
                productId: "product-9",
                quantity: 3,
              }),
            ]),
            { status: 201 },
          );
        }),
        http.post(
          "*/api/cart/items/:itemId/addons/:addonServiceId",
          ({ params }) => {
            reselected.push(`${params.itemId}:${params.addonServiceId}`);
            return HttpResponse.json(makeCart());
          },
        ),
      );

      // The `null` slot keeps the Toaster in the same position across the
      // rerender, so only the row unmounts — exactly what the cart page does.
      const tree = (rowMounted: boolean) => (
        <>
          {rowMounted ? <CartItemRow item={item} /> : null}
          <Toaster />
        </>
      );

      const { rerender } = renderWithProviders(tree(true));
      await user.click(
        screen.getByRole("button", {
          name: dict.cart.removeNamedAria("Doomed Item"),
        }),
      );
      await screen.findByRole("button", { name: dict.cart.undoRemove });

      // The real cart drops the row the moment the DELETE lands, so the offer
      // has to outlive the component that made it.
      rerender(tree(false));
      await user.click(
        screen.getByRole("button", { name: dict.cart.undoRemove }),
      );

      await waitFor(() =>
        expect(addBody).toEqual({ productId: "product-9", quantity: 3 }),
      );
      await waitFor(() =>
        expect(reselected).toEqual([
          "item-99:svc-warranty",
          "item-99:svc-insurance",
        ]),
      );
    });

    it("offers nothing when the removal itself failed", async () => {
      const user = userEvent.setup();
      server.use(
        http.delete("*/api/cart/items/:itemId", () =>
          HttpResponse.json({}, { status: 500 }),
        ),
      );

      renderWithProviders(
        <>
          <CartItemRow
            item={makeCartItem({ id: "item-7", productName: "Doomed Item" })}
          />
          <Toaster />
        </>,
      );
      await user.click(
        screen.getByRole("button", {
          name: dict.cart.removeNamedAria("Doomed Item"),
        }),
      );

      // The line is still there — an undo button would be a lie.
      expect(await screen.findByRole("alert")).toHaveTextContent(
        dict.cart.updateError,
      );
      expect(
        screen.queryByRole("button", { name: dict.cart.undoRemove }),
      ).not.toBeInTheDocument();
      expect(toastSpy).not.toHaveBeenCalled();
    });
  });
});
