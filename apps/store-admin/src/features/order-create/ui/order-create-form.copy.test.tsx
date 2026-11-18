import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { OrderCopyDraftEntity } from "@/entities/order";
import { OrderCreateForm } from "./order-create-form";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/shared/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const t = dict.orderCreate;
const SOURCE = "7c1e9a42-0000-4000-8000-000000000001";
const PRODUCT = "550e8400-e29b-41d4-a716-446655440010";

function draft(
  overrides: Partial<OrderCopyDraftEntity> = {},
): OrderCopyDraftEntity {
  return {
    sourceOrderId: SOURCE,
    sourceStatus: "PROCESSING",
    canCancelOriginal: true,
    userId: null,
    customer: null,
    contact: {
      name: "Олена Коваль",
      phone: "380501234567",
      email: null,
    },
    paymentMethod: "ON_DELIVERY",
    deliveryMethod: "OTHER",
    pickupPointId: null,
    shippingAddress: {
      firstName: "Олена",
      lastName: "Коваль",
      phone: "+380501234567",
      city: "Львів",
      address1: "вул. Городоцька, 5",
      postalCode: null,
      npCityRef: null,
      npWarehouseRef: null,
    },
    shippingCost: null,
    notes: null,
    items: [
      {
        productId: PRODUCT,
        productName: "Чохол iPhone 15",
        sku: null,
        price: "549.00",
        quantity: 1,
        stock: 1,
      },
    ],
    dropped: [],
    heldKop: 0,
    ...overrides,
  } as OrderCopyDraftEntity;
}

const field = (name: string) =>
  document.getElementById(`order-create-${name}`) as HTMLInputElement;

const cancelBox = () =>
  screen.queryByRole("checkbox", {
    name: t.copyCancelOriginal("#7C1E9A42"),
  });

function capturePost(): Array<Record<string, unknown>> {
  const bodies: Array<Record<string, unknown>> = [];
  server.use(
    http.post("*/api/admin/orders", async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({
        data: { id: "11111111-2222-3333-4444-555555555555" },
        meta: { accessUrl: null },
      });
    }),
  );
  return bodies;
}

/** TASK-2048: «Створити копію» — the create form started from an original. */
describe("OrderCreateForm — a copy of an order (TASK-2048)", () => {
  it("starts from the original: client, destination and lines", async () => {
    renderWithProviders(<OrderCreateForm copyDraft={draft()} />);

    await waitFor(() => expect(field("contactFirstName")).toHaveValue("Олена"));
    expect(field("contactLastName")).toHaveValue("Коваль");
    expect(field("city")).toHaveValue("Львів");
    expect(field("address1")).toHaveValue("вул. Городоцька, 5");
    expect(screen.getByText("Чохол iPhone 15")).toBeInTheDocument();
  });

  it("warns about lines that did not make it whole", async () => {
    renderWithProviders(
      <OrderCreateForm
        copyDraft={draft({
          dropped: [
            {
              productId: "p-gone",
              productName: "Скло старе",
              requested: 2,
              copied: 0,
              reason: "INACTIVE",
            },
            {
              productId: PRODUCT,
              productName: "Чохол iPhone 15",
              requested: 3,
              copied: 1,
              reason: "CLAMPED",
            },
          ],
        })}
      />,
    );

    const alert = await screen.findByRole("alert", {
      name: t.copyDroppedTitle,
    });
    expect(alert).toHaveTextContent(t.copyDroppedLine("Скло старе", 2, 0));
    expect(alert).toHaveTextContent(t.copyDroppedLine("Чохол iPhone 15", 3, 1));
  });

  it("offers «Скасувати #старе», ticked, while the original is pre-shipment", async () => {
    renderWithProviders(<OrderCreateForm copyDraft={draft()} />);

    expect(await screen.findByText(t.copyHeading("#7C1E9A42"))).toBeVisible();
    expect(cancelBox()).toBeChecked();
  });

  it("has no cancel box for an original already cancelled or shipped", async () => {
    renderWithProviders(
      <OrderCreateForm
        copyDraft={draft({
          canCancelOriginal: false,
          sourceStatus: "CANCELLED",
        })}
      />,
    );

    expect(await screen.findByText(t.copyHeading("#7C1E9A42"))).toBeVisible();
    expect(cancelBox()).not.toBeInTheDocument();
  });

  it("sends the original and the operator's cancel choice", async () => {
    const user = userEvent.setup();
    const bodies = capturePost();
    renderWithProviders(<OrderCreateForm copyDraft={draft()} />);
    await waitFor(() => expect(field("contactFirstName")).toHaveValue("Олена"));

    await user.click(screen.getByRole("button", { name: t.submit }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      copyOfOrderId: SOURCE,
      cancelOriginal: true,
      items: [{ productId: PRODUCT, quantity: 1 }],
    });
  });

  it("sends cancelOriginal false once the operator unticks it", async () => {
    const user = userEvent.setup();
    const bodies = capturePost();
    renderWithProviders(<OrderCreateForm copyDraft={draft()} />);
    await waitFor(() => expect(cancelBox()).toBeChecked());

    await user.click(cancelBox()!);
    await user.click(screen.getByRole("button", { name: t.submit }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      copyOfOrderId: SOURCE,
      cancelOriginal: false,
    });
  });

  it("says so when the original shipped before the copy was saved (409)", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/admin/orders", () =>
        HttpResponse.json(
          {
            statusCode: 409,
            error: "ORDER_COPY_ORIGINAL_NOT_CANCELLABLE",
            message: "The original order is SHIPPED now",
          },
          { status: 409 },
        ),
      ),
    );
    renderWithProviders(<OrderCreateForm copyDraft={draft()} />);
    await waitFor(() => expect(field("contactFirstName")).toHaveValue("Олена"));

    await user.click(screen.getByRole("button", { name: t.submit }));

    expect(await screen.findByText(t.copyOriginalGone)).toBeVisible();
  });
});
