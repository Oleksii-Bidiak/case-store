import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeCart, makeCartItem } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import { Toaster } from "@/shared/ui";
import { CartSheet } from "./cart-sheet";

/**
 * TASK-497 against the SHIPPED mini-cart, not a hand-built harness: the sheet
 * is a Radix modal that `aria-hidden`s and focus-traps everything outside it,
 * so the undo toast of a line removed here must land in the toaster the sheet
 * mounts inside itself — never in the app's global one (rendered alongside,
 * exactly as `app/providers.tsx` does).
 */
describe("CartSheet — undo toast (TASK-497)", () => {
  function setupCart() {
    let lines = [
      makeCartItem({
        id: "item-7",
        productId: "product-9",
        productName: "Doomed Item",
      }),
    ];
    const state = { restored: false };
    server.use(
      http.get("*/api/cart", () => HttpResponse.json(makeCart(lines))),
      http.delete("*/api/cart/items/:itemId", () => {
        lines = [];
        return HttpResponse.json(makeCart([]));
      }),
      http.post("*/api/cart/items", () => {
        state.restored = true;
        lines = [makeCartItem({ id: "item-99", productId: "product-9" })];
        return HttpResponse.json(makeCart(lines), { status: 201 });
      }),
    );
    return state;
  }

  function renderSheet() {
    return renderWithProviders(
      <>
        <CartSheet open onOpenChange={jest.fn()} />
        {/* The app's global toaster, outside the dialog. */}
        <Toaster />
      </>,
    );
  }

  async function removeLine(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole("button", {
        name: dict.cart.removeNamedAria("Doomed Item"),
      }),
    );
  }

  it("shows «Повернути» inside the dialog, exposed to assistive tech, once", async () => {
    const user = userEvent.setup();
    setupCart();

    renderSheet();
    await removeLine(user);

    const dialog = screen.getByRole("dialog");
    // Role queries skip aria-hidden subtrees — finding it proves it is exposed.
    expect(
      await within(dialog).findByRole("button", {
        name: dict.cart.undoRemove,
      }),
    ).toBeInTheDocument();
    // The last line is gone and the empty state took over — the toast must
    // survive that swap, and must not be duplicated in the global toaster.
    expect(
      await within(dialog).findByText(dict.cart.emptyHeading),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(dict.cart.removedToast("Doomed Item")),
    ).toHaveLength(1);
  });

  it("is reachable with Tab and restores the line on Enter", async () => {
    const user = userEvent.setup();
    const state = setupCart();

    renderSheet();
    await removeLine(user);
    const undo = await within(screen.getByRole("dialog")).findByRole("button", {
      name: dict.cart.undoRemove,
    });

    // Walk the dialog's (focus-trapped) tab order like a keyboard user would.
    for (let i = 0; i < 25 && document.activeElement !== undo; i += 1) {
      await user.tab();
    }
    expect(undo).toHaveFocus();

    await user.keyboard("{Enter}");
    await waitFor(() => expect(state.restored).toBe(true));
  });
});

describe("CartSheet — delivery note (TASK-881)", () => {
  it("says the delivery price comes at checkout, never that it is free", async () => {
    server.use(
      http.get("*/api/cart", () =>
        HttpResponse.json(makeCart([makeCartItem({ id: "item-1" })])),
      ),
    );

    renderWithProviders(<CartSheet open onOpenChange={jest.fn()} />);

    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText(dict.cart.sheetDeliveryNote),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/безкоштовн/i)).not.toBeInTheDocument();
  });
});
