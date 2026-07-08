import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { OrderTimeline } from "./order-timeline";

const CUSTOMER_USER_ID = "user-1";

const historyRows = [
  {
    id: "hist-1",
    orderId: "order-1",
    changeType: "STATUS",
    fromStatus: null,
    toStatus: "PENDING",
    fromPaymentStatus: null,
    toPaymentStatus: null,
    changedBy: null,
    changedAt: "2026-07-08T10:00:00.000Z",
  },
  {
    id: "hist-2",
    orderId: "order-1",
    changeType: "STATUS",
    fromStatus: "PENDING",
    toStatus: "CONFIRMED",
    fromPaymentStatus: null,
    toPaymentStatus: null,
    changedBy: "admin-9",
    changedAt: "2026-07-08T11:00:00.000Z",
  },
  {
    id: "hist-3",
    orderId: "order-1",
    changeType: "STATUS",
    fromStatus: "CONFIRMED",
    toStatus: "CANCELLED",
    fromPaymentStatus: null,
    toPaymentStatus: null,
    changedBy: CUSTOMER_USER_ID,
    changedAt: "2026-07-08T12:00:00.000Z",
  },
];

function mockHistory(rows: unknown[]) {
  server.use(
    http.get("*/api/admin/orders/:orderId/history", () =>
      HttpResponse.json({ data: rows }),
    ),
  );
}

describe("OrderTimeline (TASK-251)", () => {
  it("renders the entries oldest-first with the correct actor per row", async () => {
    mockHistory(historyRows);

    renderWithProviders(
      <OrderTimeline orderId="order-1" customerUserId={CUSTOMER_USER_ID} />,
    );

    // Creation row → system-authored.
    expect(
      await screen.findByText("Замовлення створено (Очікує підтвердження)"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Система ·/)).toBeInTheDocument();

    // Admin-authored transition.
    expect(
      screen.getByText("Статус: Очікує підтвердження → Підтверджено"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Адміністратор ·/)).toBeInTheDocument();

    // Customer self-cancel (changedBy === the order owner).
    expect(
      screen.getByText("Статус: Підтверджено → Скасовано"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Клієнт ·/)).toBeInTheDocument();

    // Oldest-first ordering is preserved.
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(
      "Замовлення створено (Очікує підтвердження)",
    );
    expect(items[2]).toHaveTextContent("Статус: Підтверджено → Скасовано");
  });

  it("shows an error message when the request fails", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId/history", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    renderWithProviders(
      <OrderTimeline orderId="order-1" customerUserId={CUSTOMER_USER_ID} />,
    );

    expect(
      await screen.findByText(dict.orders.timelineLoadError),
    ).toBeInTheDocument();
  });

  it("shows the empty-state copy when there are no rows", async () => {
    mockHistory([]);

    renderWithProviders(
      <OrderTimeline orderId="order-1" customerUserId={CUSTOMER_USER_ID} />,
    );

    expect(
      await screen.findByText(dict.orders.timelineEmpty),
    ).toBeInTheDocument();
  });
});
