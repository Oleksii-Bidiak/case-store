import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminSidebar } from "./admin-sidebar";

// usePathname is unavailable under jsdom — pin the active route to the dashboard
// so no nav item is highlighted as the current page.
jest.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

/** Mock both always-mounted sidebar counters (contact unread + needs-action). */
function mockCounters(counts: {
  newOrders: number;
  pendingReviews: number;
  unread?: number;
}) {
  server.use(
    http.get("*/api/contact/admin/unread-count", () =>
      HttpResponse.json({ data: { unread: counts.unread ?? 0 } }),
    ),
    http.get("*/api/admin/dashboard/needs-action", () =>
      HttpResponse.json({
        data: {
          newOrders: counts.newOrders,
          pendingReviews: counts.pendingReviews,
          unpaidInTransit: 0,
          failedMails: 0,
        },
      }),
    ),
  );
}

describe("AdminSidebar — needs-action badges (TASK-248)", () => {
  it("renders count badges next to Orders and Reviews when their counts are > 0", async () => {
    mockCounters({ newOrders: 4, pendingReviews: 2 });

    renderWithProviders(<AdminSidebar />);

    const ordersBadge = await screen.findByLabelText(
      dict.dashboard.newOrdersBadgeAria(4),
    );
    expect(ordersBadge).toHaveTextContent("4");
    expect(ordersBadge.closest("a")).toHaveAttribute("href", "/orders");

    const reviewsBadge = screen.getByLabelText(
      dict.dashboard.pendingReviewsBadgeAria(2),
    );
    expect(reviewsBadge).toHaveTextContent("2");
    expect(reviewsBadge.closest("a")).toHaveAttribute("href", "/reviews");
  });

  it("omits both badges when their counts are zero", async () => {
    mockCounters({ newOrders: 0, pendingReviews: 0 });

    renderWithProviders(<AdminSidebar />);

    // Orders/Reviews nav links still render, without a badge.
    expect(
      await screen.findByRole("link", { name: dict.nav.orders }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/нових замовлень/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/відгуків на модерації/),
    ).not.toBeInTheDocument();
  });
});
