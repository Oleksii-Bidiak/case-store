import { http, HttpResponse } from "msw";
import { QueryClient } from "@tanstack/react-query";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { OrderParcelReturnAction } from "./order-parcel-return-action";

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const d = dict.orders;
const ORDER_ID = "order-1";

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
});

function item(id: string, productName: string, quantity: number) {
  return {
    id,
    productId: `p-${id}`,
    productName,
    productSlug: id,
    quantity,
    price: "100.00",
    lineTotal: "100.00",
    addons: [],
    createdAt: "2026-11-01T10:00:00.000Z",
  };
}

const ORDER = {
  id: ORDER_ID,
  canReturnParcel: true,
  items: [item("i-1", "Чохол MagSafe", 2), item("i-2", "Скло захисне", 1)],
};

function renderAction(
  order: typeof ORDER = ORDER,
  permissions: string[] = ["orders:write"],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = jest.spyOn(queryClient, "invalidateQueries");
  renderWithProviders(<OrderParcelReturnAction order={order} />, {
    auth: { permissions },
    queryClient,
  });
  return { invalidate };
}

/** Records how many times the endpoint was called; answers with `reply`. */
function stubReturn(reply: () => Response) {
  const calls = { count: 0 };
  server.use(
    http.post("*/api/admin/orders/:orderId/parcel-returned", () => {
      calls.count += 1;
      return reply();
    }),
  );
  return calls;
}

const button = () => screen.getByRole("button", { name: d.parcelReturnAction });
const invalidatedKeys = (spy: jest.SpyInstance) =>
  spy.mock.calls.map(
    ([filters]) => (filters as { queryKey: readonly unknown[] }).queryKey[0],
  );

async function confirmDialog() {
  await userEvent.click(button());
  const dialog = await screen.findByRole("alertdialog");
  return dialog;
}

describe("OrderParcelReturnAction (TASK-2575)", () => {
  it("is absent without orders:write", () => {
    renderAction(ORDER, ["orders:read"]);
    expect(
      screen.queryByRole("button", { name: d.parcelReturnAction }),
    ).not.toBeInTheDocument();
  });

  it("is absent when the server does not allow it", () => {
    renderAction({ ...ORDER, canReturnParcel: false });
    expect(
      screen.queryByRole("button", { name: d.parcelReturnAction }),
    ).not.toBeInTheDocument();
  });

  it("lists every line in the confirm, and cancel sends nothing", async () => {
    const calls = stubReturn(() => HttpResponse.json({ data: {} }));
    renderAction();

    const dialog = await confirmDialog();
    expect(dialog).toHaveTextContent(d.parcelReturnConfirmDescription);
    expect(dialog).toHaveTextContent(d.parcelReturnLine("Чохол MagSafe", 2));
    expect(dialog).toHaveTextContent(d.parcelReturnLine("Скло захисне", 1));

    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(calls.count).toBe(0);
  });

  it("confirm → POST → re-reads the order, its history and the list, and says so", async () => {
    const calls = stubReturn(() =>
      HttpResponse.json({ data: { id: ORDER_ID } }),
    );
    const { invalidate } = renderAction();

    const dialog = await confirmDialog();
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.parcelReturnConfirm }),
    );

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(d.parcelReturnDone),
    );
    expect(calls.count).toBe(1);
    expect(invalidatedKeys(invalidate)).toEqual(
      expect.arrayContaining([
        `/api/admin/orders/${ORDER_ID}`,
        `/api/admin/orders/${ORDER_ID}/history`,
        `/api/admin/orders`,
      ]),
    );
  });

  it.each([
    ["ORDER_PARCEL_ALREADY_RETURNED", d.parcelReturnAlready],
    ["ORDER_NOT_CANCELLED_AFTER_SHIPMENT", d.parcelReturnNotShipped],
    ["ORDER_HAS_RETURN", d.parcelReturnHasReturn],
  ])(
    "409 %s → its own message, and the order is re-read",
    async (code, text) => {
      stubReturn(() =>
        HttpResponse.json(
          { statusCode: 409, error: code, message: "Conflict in English" },
          { status: 409 },
        ),
      );
      const { invalidate } = renderAction();

      const dialog = await confirmDialog();
      await userEvent.click(
        within(dialog).getByRole("button", { name: d.parcelReturnConfirm }),
      );

      await waitFor(() => expect(toastError).toHaveBeenCalledWith(text));
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(invalidatedKeys(invalidate)).toContain(
        `/api/admin/orders/${ORDER_ID}`,
      );
    },
  );

  it("any other failure → the generic copy, never the server's English", async () => {
    stubReturn(() =>
      HttpResponse.json(
        { statusCode: 500, error: "Internal", message: "boom" },
        { status: 500 },
      ),
    );
    renderAction();

    const dialog = await confirmDialog();
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.parcelReturnConfirm }),
    );
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(d.parcelReturnFailed),
    );
  });
});
