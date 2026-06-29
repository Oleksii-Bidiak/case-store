import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeOrder } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import { Toaster } from "@/shared/ui";
import { CancelOrderButton } from "./cancel-order-button";

/**
 * RTL + MSW tests for CancelOrderButton (TASK-131-E). A `<Toaster />` is rendered
 * alongside the button so sonner toast copy lands in the document and can be
 * asserted — the real app mounts it once in `app/providers.tsx`.
 */
function renderButton(orderId = "order-1") {
  return renderWithProviders(
    <>
      <CancelOrderButton orderId={orderId} />
      <Toaster />
    </>,
    { auth: { isAuthenticated: true, accessToken: "token" } },
  );
}

describe("CancelOrderButton", () => {
  it("cancels the order after confirming the dialog (happy path)", async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.patch("*/api/orders/:orderId/cancel", () => {
        calls += 1;
        return HttpResponse.json(makeOrder({ status: "CANCELLED" }));
      }),
    );

    renderButton();

    await user.click(
      screen.getByRole("button", { name: dict.cancelOrder.trigger }),
    );
    expect(
      await screen.findByText(dict.cancelOrder.dialogTitle),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: dict.cancelOrder.confirm }),
    );

    expect(
      await screen.findByText(dict.cancelOrder.success),
    ).toBeInTheDocument();
    await waitFor(() => expect(calls).toBe(1));
  });

  it("does not fire a request when the user keeps the order", async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.patch("*/api/orders/:orderId/cancel", () => {
        calls += 1;
        return HttpResponse.json(makeOrder({ status: "CANCELLED" }));
      }),
    );

    renderButton();

    await user.click(
      screen.getByRole("button", { name: dict.cancelOrder.trigger }),
    );
    expect(
      await screen.findByText(dict.cancelOrder.dialogTitle),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: dict.cancelOrder.cancel }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText(dict.cancelOrder.dialogTitle),
      ).not.toBeInTheDocument(),
    );
    expect(calls).toBe(0);
  });

  it("shows an error toast when the cancel request fails", async () => {
    const user = userEvent.setup();
    server.use(
      http.patch("*/api/orders/:orderId/cancel", () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );

    renderButton();

    await user.click(
      screen.getByRole("button", { name: dict.cancelOrder.trigger }),
    );
    await user.click(
      await screen.findByRole("button", { name: dict.cancelOrder.confirm }),
    );

    expect(await screen.findByText(dict.cancelOrder.error)).toBeInTheDocument();
  });

  it("disables the confirm button and shows a pending label while in flight", async () => {
    const user = userEvent.setup();
    server.use(
      http.patch(
        "*/api/orders/:orderId/cancel",
        () => new Promise<never>(() => {}),
      ),
    );

    renderButton();

    await user.click(
      screen.getByRole("button", { name: dict.cancelOrder.trigger }),
    );
    await user.click(
      await screen.findByRole("button", { name: dict.cancelOrder.confirm }),
    );

    const confirming = await screen.findByRole("button", {
      name: dict.cancelOrder.confirming,
    });
    expect(confirming).toBeDisabled();
  });
});
