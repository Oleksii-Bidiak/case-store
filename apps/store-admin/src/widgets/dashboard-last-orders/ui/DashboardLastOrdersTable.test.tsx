import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { orderStatusLabel } from "@/entities/order";
import { DashboardLastOrdersTable } from "./DashboardLastOrdersTable";

interface MockOrder {
  id: string;
  status: string;
  total: string;
  email: string;
}

function makeOrder({ id, status, total, email }: MockOrder) {
  return {
    id,
    userId: `user-${id}`,
    status,
    paymentStatus: "PENDING",
    subtotal: total,
    discount: "0.00",
    discountCode: null,
    shippingCost: "0.00",
    tax: "0.00",
    total,
    shippingAddress: null,
    billingAddress: null,
    notes: null,
    items: [],
    customer: {
      id: `user-${id}`,
      email,
      firstName: "Ivan",
      lastName: "Petrenko",
    },
    createdAt: "2026-07-07T10:00:00.000Z",
    updatedAt: "2026-07-07T10:00:00.000Z",
  };
}

function mockOrders(orders: MockOrder[]) {
  server.use(
    http.get("*/api/admin/orders", () =>
      HttpResponse.json({
        data: orders.map(makeOrder),
        meta: {
          total: orders.length,
          page: 1,
          limit: 5,
          totalPages: orders.length === 0 ? 0 : 1,
        },
      }),
    ),
  );
}

const FIVE_ORDERS: MockOrder[] = [
  {
    id: "aaaaaaaa-1",
    status: "PENDING",
    total: "100.00",
    email: "a@test.local",
  },
  {
    id: "bbbbbbbb-2",
    status: "CONFIRMED",
    total: "200.00",
    email: "b@test.local",
  },
  {
    id: "cccccccc-3",
    status: "PROCESSING",
    total: "300.00",
    email: "c@test.local",
  },
  {
    id: "dddddddd-4",
    status: "SHIPPED",
    total: "400.00",
    email: "d@test.local",
  },
  {
    id: "eeeeeeee-5",
    status: "DELIVERED",
    total: "500.00",
    email: "e@test.local",
  },
];

describe("DashboardLastOrdersTable (TASK-249)", () => {
  it("renders the 5 most recent orders with status badges and a working view link", async () => {
    mockOrders(FIVE_ORDERS);

    renderWithProviders(<DashboardLastOrdersTable />);

    // Heading + first customer render once the fetch resolves.
    expect(
      await screen.findByText(dict.dashboard.lastOrders),
    ).toBeInTheDocument();
    expect(screen.getByText("a@test.local")).toBeInTheDocument();

    // Each distinct status label surfaces as a badge.
    const table = screen.getByRole("table");
    expect(
      within(table).getByText(orderStatusLabel("PENDING")),
    ).toBeInTheDocument();
    expect(
      within(table).getByText(orderStatusLabel("DELIVERED")),
    ).toBeInTheDocument();

    // Five "Переглянути" links, each pointing at the order detail route.
    const links = within(table).getAllByRole("link", {
      name: dict.common.view,
    });
    expect(links).toHaveLength(5);
    expect(links[0]).toHaveAttribute("href", "/orders/aaaaaaaa-1");
    expect(links[4]).toHaveAttribute("href", "/orders/eeeeeeee-5");
  });

  it("shows the empty-state copy when there are no orders", async () => {
    mockOrders([]);

    renderWithProviders(<DashboardLastOrdersTable />);

    expect(
      await screen.findByText(dict.dashboard.noLastOrders),
    ).toBeInTheDocument();
  });

  it("names each order «#AAAAAAAA» with the full id in the title, no «…» (TASK-1038)", async () => {
    mockOrders([
      {
        id: "7c1e9a42-4b2e-9f1a-0000-000000000001",
        status: "PENDING",
        total: "100.00",
        email: "a@test.local",
      },
    ]);

    renderWithProviders(<DashboardLastOrdersTable />);

    const table = await screen.findByRole("table");
    const number = within(table).getByText("#7C1E9A42");
    expect(number).toHaveAttribute(
      "title",
      "7c1e9a42-4b2e-9f1a-0000-000000000001",
    );
    expect(screen.queryByText(/7c1e9a42…/)).not.toBeInTheDocument();
  });

  it("links «Усі замовлення» to the orders list", async () => {
    mockOrders(FIVE_ORDERS);

    renderWithProviders(<DashboardLastOrdersTable />);

    expect(
      await screen.findByRole("link", { name: dict.dashboard.allOrdersLink }),
    ).toHaveAttribute("href", "/orders");
  });

  it("renders a card per order for phones, each opening the order", async () => {
    mockOrders(FIVE_ORDERS);

    renderWithProviders(<DashboardLastOrdersTable />);

    const cards = await screen.findByRole("list", {
      name: dict.dashboard.lastOrders,
    });
    const items = within(cards).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    const first = within(items[0]).getByRole("link");
    expect(first).toHaveAttribute("href", "/orders/aaaaaaaa-1");
    expect(first).toHaveTextContent("#AAAAAAAA");
    expect(first).toHaveTextContent(orderStatusLabel("PENDING"));
    expect(first).toHaveTextContent("Ivan Petrenko");
  });

  it("shows «Повторити» when the list fails, and refetches on click", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/admin/orders", () => {
        calls += 1;
        return HttpResponse.json(
          { error: "Internal Server Error", message: "boom", statusCode: 500 },
          { status: 500 },
        );
      }),
    );

    renderWithProviders(<DashboardLastOrdersTable />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(dict.dashboard.lastOrdersLoadError);
    // The way to the whole list stays while this block is down.
    expect(
      screen.getByRole("link", { name: dict.dashboard.allOrdersLink }),
    ).toBeInTheDocument();
    expect(calls).toBeGreaterThan(0);

    mockOrders(FIVE_ORDERS);
    await userEvent.click(
      within(alert).getByRole("button", { name: dict.canon.retry }),
    );
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });
});
