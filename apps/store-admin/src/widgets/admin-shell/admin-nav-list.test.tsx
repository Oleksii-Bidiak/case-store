import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, fireEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminNavList } from "./admin-nav-list";

// usePathname is unavailable under jsdom — pin the active route to the dashboard
// so no nav item is highlighted as the current page.
jest.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

/** Mock both always-mounted nav counters (contact unread + needs-action). */
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

describe("AdminNavList — needs-action badges (TASK-248)", () => {
  it("renders count badges next to Orders, Reviews, and Messages when their counts are > 0", async () => {
    mockCounters({ newOrders: 4, pendingReviews: 2, unread: 3 });

    renderWithProviders(<AdminNavList />);

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

    const messagesBadge = screen.getByLabelText(
      dict.messages.unreadBadgeAria(3),
    );
    expect(messagesBadge).toHaveTextContent("3");
    expect(messagesBadge.closest("a")).toHaveAttribute("href", "/messages");
  });

  it("omits the badges when their counts are zero", async () => {
    mockCounters({ newOrders: 0, pendingReviews: 0, unread: 0 });

    renderWithProviders(<AdminNavList />);

    // Orders/Reviews/Messages nav links still render, without a badge.
    expect(
      await screen.findByRole("link", { name: dict.nav.orders }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/нових замовлень/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/відгуків на модерації/),
    ).not.toBeInTheDocument();
  });
});

describe("AdminNavList — onNavigate (close-on-navigate, TASK-204 pattern)", () => {
  it("calls onNavigate exactly once when a nav link is clicked", async () => {
    mockCounters({ newOrders: 0, pendingReviews: 0, unread: 0 });
    const onNavigate = jest.fn();

    renderWithProviders(<AdminNavList onNavigate={onNavigate} />);

    fireEvent.click(
      await screen.findByRole("link", { name: dict.nav.products }),
    );

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("also fires onNavigate for a bottom-nav link click", async () => {
    mockCounters({ newOrders: 0, pendingReviews: 0, unread: 0 });
    const onNavigate = jest.fn();

    renderWithProviders(<AdminNavList onNavigate={onNavigate} />);

    fireEvent.click(await screen.findByRole("link", { name: dict.nav.faq }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
