import { http, HttpResponse, delay } from "msw";
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
import { getGetCartQueryKey } from "@/entities/cart";
import { CartView } from "./cart-view";
import { CartSheet } from "./cart-sheet";

/**
 * TASK-657 — «Прибрати недоступні»: one click clears every withdrawn line with
 * the existing DELETE (one call per line), refetches the cart once, raises one
 * toast and hands focus to the unblocked checkout CTA. Driven against the
 * shipped CartView / CartSheet over MSW, not a harness.
 */
function setupCart({ withLiveLine = true, failIds = [] as string[] } = {}) {
  let lines = [
    ...(withLiveLine
      ? [makeCartItem({ id: "live", productName: "Живий чохол" })]
      : []),
    ...["gone-1", "gone-2", "gone-3"].map((id, i) =>
      makeCartItem({
        id,
        productId: `product-${id}`,
        productName: `Знятий товар ${i + 1}`,
        // Two units of one line still count as ONE thing to remove.
        quantity: i === 0 ? 2 : 1,
        isActive: false,
      }),
    ),
  ];
  const calls = {
    deleted: [] as string[],
    cartGets: 0,
    // DELETEs open at the same time — the cart is one row server-side, so the
    // loop must never let two overlap.
    inFlight: 0,
    maxInFlight: 0,
  };
  server.use(
    http.get("*/api/cart", () => {
      calls.cartGets += 1;
      return HttpResponse.json(makeCart(lines));
    }),
    http.delete("*/api/cart/items/:itemId", async ({ params }) => {
      const id = String(params.itemId);
      calls.deleted.push(id);
      calls.inFlight += 1;
      calls.maxInFlight = Math.max(calls.maxInFlight, calls.inFlight);
      // Long enough that a parallel loop would have all three open at once.
      await delay(20);
      calls.inFlight -= 1;
      if (failIds.includes(id)) {
        return HttpResponse.json({ message: "boom" }, { status: 500 });
      }
      lines = lines.filter((line) => line.id !== id);
      return HttpResponse.json(makeCart(lines));
    }),
  );
  return calls;
}

describe("CartView — «Прибрати недоступні» (TASK-657)", () => {
  function renderPage() {
    return renderWithProviders(
      <>
        <CartView />
        <Toaster />
      </>,
    );
  }

  it("removes all three withdrawn lines in one click and unblocks checkout", async () => {
    const user = userEvent.setup();
    const calls = setupCart();
    renderPage();

    // N counts lines (3), not units (4).
    const button = await screen.findByRole("button", {
      name: "Прибрати 3 недоступні товари",
    });
    expect(
      screen.getByRole("button", { name: dict.cart.checkout }),
    ).toBeDisabled();
    const getsBefore = calls.cartGets;

    await user.click(button);

    const checkout = await screen.findByRole("link", {
      name: dict.cart.checkoutAria,
    });
    expect(calls.deleted).toEqual(["gone-1", "gone-2", "gone-3"]);
    // One refetch for the whole batch, not one per line.
    expect(calls.cartGets).toBe(getsBefore + 1);
    expect(
      await screen.findByText("Прибрано 3 недоступні товари з кошика"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Прибрано 3 недоступні товари з кошика"),
    ).toHaveLength(1);
    // No per-row undo toasts: the lines are withdrawn, there is nothing to undo.
    expect(screen.queryByText(dict.cart.undoRemove)).not.toBeInTheDocument();
    expect(
      screen.queryByText(dict.cart.checkoutBlocked),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Прибрати \d+ недоступн/ }),
    ).not.toBeInTheDocument();
    // The pressed button is gone; focus is on the CTA it unblocked.
    await waitFor(() => expect(checkout).toHaveFocus());
  });

  it("names the button with the count of withdrawn LINES — its visible text", async () => {
    setupCart();
    renderPage();

    // 3 withdrawn lines holding 4 units → «3», with the Ukrainian plural.
    // Anchored: the per-row «Прибрати недоступний товар «…»» buttons differ.
    const button = await screen.findByRole("button", {
      name: /^Прибрати \d+ недоступн/,
    });
    expect(button).toHaveAccessibleName("Прибрати 3 недоступні товари");
    expect(button).toHaveTextContent("Прибрати 3 недоступні товари");
    // No aria-label that could drift from what a sighted user reads.
    expect(button).not.toHaveAttribute("aria-label");
  });

  it("sends the DELETEs one after another, never in parallel", async () => {
    const user = userEvent.setup();
    const calls = setupCart();
    renderPage();

    await user.click(
      await screen.findByRole("button", {
        name: "Прибрати 3 недоступні товари",
      }),
    );

    await screen.findByText("Прибрано 3 недоступні товари з кошика");
    // In cart order, one call per withdrawn line — the live line untouched.
    expect(calls.deleted).toEqual(["gone-1", "gone-2", "gone-3"]);
    expect(calls.maxInFlight).toBe(1);
  });

  it("hands keyboard focus to the unblocked «Оформити замовлення»", async () => {
    const user = userEvent.setup();
    setupCart();
    renderPage();

    const button = await screen.findByRole("button", {
      name: "Прибрати 3 недоступні товари",
    });
    // Keyboard path: the button is focused and activated with Enter.
    button.focus();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");

    const checkout = await screen.findByRole("link", {
      name: dict.cart.checkoutAria,
    });
    await waitFor(() => expect(checkout).toHaveFocus());
    // Not the fallback: the summary heading is only for a CTA-less summary.
    expect(
      screen.getByRole("heading", { level: 2, name: dict.cart.summaryHeading }),
    ).not.toHaveFocus();
  });

  it("reports a partial failure, keeps the failed line and the button", async () => {
    const user = userEvent.setup();
    const calls = setupCart({ failIds: ["gone-2"] });
    renderPage();

    await user.click(
      await screen.findByRole("button", {
        name: "Прибрати 3 недоступні товари",
      }),
    );

    expect(
      await screen.findByText(
        "Не вдалося прибрати 1 недоступний товар. Спробуйте ще раз.",
      ),
    ).toBeInTheDocument();
    // Every line was attempted; one stayed.
    expect(calls.deleted).toEqual(["gone-1", "gone-2", "gone-3"]);
    const retry = await screen.findByRole("button", {
      name: "Прибрати 1 недоступний товар",
    });
    expect(screen.getByText("Знятий товар 2")).toBeInTheDocument();
    expect(screen.queryByText("Знятий товар 1")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.cart.checkout }),
    ).toBeDisabled();
    expect(
      screen.queryByText("Прибрано 3 недоступні товари з кошика"),
    ).not.toBeInTheDocument();
    // The same control, now naming what is left — focus stayed on it.
    expect(retry).toHaveFocus();
  });

  it("does not steal focus later when the cart re-read after the cleanup failed", async () => {
    const user = userEvent.setup();
    const calls = setupCart({ withLiveLine: false });
    const { queryClient } = renderWithProviders(
      <>
        <button type="button">Пошук</button>
        <CartView />
        <Toaster />
      </>,
    );

    const button = await screen.findByRole("button", {
      name: "Прибрати 3 недоступні товари",
    });
    // The lines go, but the one re-read of the cart fails.
    server.use(
      http.get(
        "*/api/cart",
        () => HttpResponse.json({ message: "boom" }, { status: 500 }),
        { once: true },
      ),
    );
    await user.click(button);
    await waitFor(() => expect(calls.deleted).toHaveLength(3));
    await screen.findByText("Прибрано 3 недоступні товари з кошика");

    // Later the shopper is elsewhere on the page when the cart is read again
    // in the background (a tab refocus): the empty cart shows, focus stays.
    const elsewhere = screen.getByRole("button", { name: "Пошук" });
    elsewhere.focus();
    await queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: dict.cart.emptyHeading,
    });
    // Let the commit's effects run — a stale hand-off would fire there.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(heading).not.toHaveFocus();
    expect(elsewhere).toHaveFocus();
  });

  it("moves focus to the empty cart's heading when the cleanup empties it", async () => {
    const user = userEvent.setup();
    setupCart({ withLiveLine: false });
    renderPage();

    await user.click(
      await screen.findByRole("button", {
        name: "Прибрати 3 недоступні товари",
      }),
    );

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: dict.cart.emptyHeading,
    });
    await waitFor(() => expect(heading).toHaveFocus());
  });
});

describe("CartSheet — «Прибрати недоступні» (TASK-657)", () => {
  function renderSheet() {
    return renderWithProviders(
      <>
        <CartSheet open onOpenChange={jest.fn()} />
        {/* The app's global toaster, outside the modal. */}
        <Toaster />
      </>,
    );
  }

  it("clears the withdrawn lines from the mini-cart, toast inside the dialog", async () => {
    const user = userEvent.setup();
    const calls = setupCart();
    renderSheet();

    const dialog = await screen.findByRole("dialog");
    const button = await within(dialog).findByRole("button", {
      name: "Прибрати 3 недоступні товари",
    });

    await user.click(button);

    const checkout = await within(dialog).findByRole("link", {
      name: dict.cart.checkout,
    });
    expect(calls.deleted).toEqual(["gone-1", "gone-2", "gone-3"]);
    // Inside the modal, so it is reachable — and only there.
    expect(
      await within(dialog).findByText("Прибрано 3 недоступні товари з кошика"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Прибрано 3 недоступні товари з кошика"),
    ).toHaveLength(1);
    await waitFor(() => expect(checkout).toHaveFocus());
  });

  it("hands keyboard focus to the sheet's unblocked «Оформити замовлення»", async () => {
    const user = userEvent.setup();
    setupCart();
    renderSheet();

    const dialog = await screen.findByRole("dialog");
    const button = await within(dialog).findByRole("button", {
      name: "Прибрати 3 недоступні товари",
    });
    button.focus();
    await user.keyboard("{Enter}");

    const checkout = await within(dialog).findByRole("link", {
      name: dict.cart.checkout,
    });
    await waitFor(() => expect(checkout).toHaveFocus());
    // Focus stays inside the modal — never escapes to <body> behind it.
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("reports a partial failure inside the dialog", async () => {
    const user = userEvent.setup();
    setupCart({ failIds: ["gone-3"] });
    renderSheet();

    const dialog = await screen.findByRole("dialog");
    await user.click(
      await within(dialog).findByRole("button", {
        name: "Прибрати 3 недоступні товари",
      }),
    );

    expect(
      await within(dialog).findByText(
        "Не вдалося прибрати 1 недоступний товар. Спробуйте ще раз.",
      ),
    ).toBeInTheDocument();
    expect(
      await within(dialog).findByRole("button", {
        name: "Прибрати 1 недоступний товар",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: dict.cart.checkout }),
    ).toBeDisabled();
  });
});
