import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { OrderCreateView } from "./order-create-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

const SOURCE = "7c1e9a42-0000-4000-8000-000000000001";
const t = dict.orderCreate;

const DRAFT = {
  sourceOrderId: SOURCE,
  sourceStatus: "CANCELLED",
  canCancelOriginal: false,
  userId: null,
  customer: null,
  contact: { name: "Олена Коваль", phone: "380501234567", email: null },
  paymentMethod: "ON_DELIVERY",
  deliveryMethod: "OTHER",
  pickupPointId: null,
  shippingAddress: null,
  shippingCost: null,
  notes: null,
  items: [],
  dropped: [],
  heldKop: 0,
};

/** TASK-2048: `/orders/new?copyOf=<id>` starts from the original. */
describe("OrderCreateView — copyOf", () => {
  it("loads the original and starts the form from it", async () => {
    server.use(
      http.get(`*/api/admin/orders/${SOURCE}/copy-draft`, () =>
        HttpResponse.json({ data: DRAFT }),
      ),
    );

    renderWithProviders(<OrderCreateView copyOf={SOURCE} />);

    expect(
      await screen.findByText(t.copyHeading("#7C1E9A42")),
    ).toBeInTheDocument();
  });

  it("says so when the original cannot be loaded", async () => {
    server.use(
      http.get(`*/api/admin/orders/${SOURCE}/copy-draft`, () =>
        HttpResponse.json({ statusCode: 404 }, { status: 404 }),
      ),
    );

    renderWithProviders(<OrderCreateView copyOf={SOURCE} />);

    expect(await screen.findByText(t.copyLoadFailed)).toBeInTheDocument();
  });

  it("is the plain form without copyOf", () => {
    renderWithProviders(<OrderCreateView />);

    expect(screen.queryByText(t.copyLoading)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.submit })).toBeInTheDocument();
  });
});
