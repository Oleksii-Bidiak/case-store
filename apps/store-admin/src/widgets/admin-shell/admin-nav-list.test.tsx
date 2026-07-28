import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, fireEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
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

/**
 * Render the nav inside a session context. Owner by default, so the pre-TASK-334
 * suites below still see the complete menu; the filtering suite passes a
 * narrower session explicitly.
 */
function renderNav(
  options: {
    onNavigate?: () => void;
    isOwner?: boolean;
    permissions?: string[];
  } = {},
) {
  const { onNavigate, isOwner = true, permissions = [] } = options;
  return renderWithProviders(
    <WithAuth isOwner={isOwner} permissions={permissions}>
      <AdminNavList onNavigate={onNavigate} />
    </WithAuth>,
  );
}

describe("AdminNavList — needs-action badges (TASK-248)", () => {
  it("renders count badges next to Orders, Reviews, and Messages when their counts are > 0", async () => {
    mockCounters({ newOrders: 4, pendingReviews: 2, unread: 3 });

    renderNav();

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

    renderNav();

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

describe("AdminNavList — no dead links (TASK-184)", () => {
  it('renders no nav link pointing at a dead href="#"', async () => {
    mockCounters({ newOrders: 0, pendingReviews: 0, unread: 0 });

    renderNav();

    // Wait for the nav to mount, then assert every link has a real destination.
    await screen.findByRole("link", { name: dict.nav.dashboard });
    const deadLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === "#");
    expect(deadLinks).toHaveLength(0);
  });

  it("does not render a «Налаштування» bottom-nav item", async () => {
    mockCounters({ newOrders: 0, pendingReviews: 0, unread: 0 });

    renderNav();

    await screen.findByRole("link", { name: dict.nav.faq });
    expect(
      screen.queryByRole("link", { name: "Налаштування" }),
    ).not.toBeInTheDocument();
  });
});

describe("AdminNavList — content map entry (TASK-264)", () => {
  it("renders the «Де що на сайті» bottom-nav entry linking to /content-map", async () => {
    mockCounters({ newOrders: 0, pendingReviews: 0, unread: 0 });

    renderNav();

    const link = await screen.findByRole("link", {
      name: dict.nav.contentMap,
    });
    expect(link).toHaveAttribute("href", "/content-map");
  });
});

describe("AdminNavList — onNavigate (close-on-navigate, TASK-204 pattern)", () => {
  it("calls onNavigate exactly once when a nav link is clicked", async () => {
    mockCounters({ newOrders: 0, pendingReviews: 0, unread: 0 });
    const onNavigate = jest.fn();

    renderNav({ onNavigate });

    fireEvent.click(
      await screen.findByRole("link", { name: dict.nav.products }),
    );

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("also fires onNavigate for a bottom-nav link click", async () => {
    mockCounters({ newOrders: 0, pendingReviews: 0, unread: 0 });
    const onNavigate = jest.fn();

    renderNav({ onNavigate });

    fireEvent.click(await screen.findByRole("link", { name: dict.nav.faq }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

/**
 * TASK-334 — "different responsibilities, a different-looking admin panel" is an
 * explicit owner requirement, so these assertions are about ABSENCE: a content
 * manager must not see a «Замовлення» section that answers 403 when clicked.
 *
 * Hiding a link is convenience, never protection — the server guard is the
 * control. These tests pin the convenience; `rbac.e2e-spec.ts` on the API pins
 * the control.
 */
describe("AdminNavList — permission filtering (TASK-334)", () => {
  it("shows a content manager only the sections they hold", async () => {
    mockCounters({ newOrders: 0, pendingReviews: 0, unread: 0 });

    renderNav({
      isOwner: false,
      permissions: ["blog:write", "pages:write"],
    });

    // Granted sections are present…
    expect(
      await screen.findByRole("link", { name: dict.nav.blog }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.nav.pages }),
    ).toBeInTheDocument();
    // …the dashboard is everyone's landing page…
    expect(
      screen.getByRole("link", { name: dict.nav.dashboard }),
    ).toBeInTheDocument();

    // …and everything they do not hold is absent, not merely disabled.
    expect(
      screen.queryByRole("link", { name: dict.nav.orders }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: dict.nav.products }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: dict.nav.users }),
    ).not.toBeInTheDocument();
  });

  it("hides the owner-only sections from a manager, whatever they are granted", async () => {
    mockCounters({ newOrders: 0, pendingReviews: 0, unread: 0 });

    // Every catalogue permission the nav references — the matrix and the action
    // log must STILL be hidden, because neither is grantable at all.
    renderNav({
      isOwner: false,
      permissions: [
        "orders:read",
        "products:read",
        "customers:read",
        "analytics:read",
        "blog:write",
        "pages:write",
        "banners:write",
        "faq:write",
        "settings:seo",
        "settings:contacts",
      ],
    });

    await screen.findByRole("link", { name: dict.nav.orders });
    expect(
      screen.queryByRole("link", { name: dict.nav.permissions }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: dict.nav.auditLog }),
    ).not.toBeInTheDocument();
  });

  it("shows the owner the matrix and the action log", async () => {
    mockCounters({ newOrders: 0, pendingReviews: 0, unread: 0 });

    renderNav();

    expect(
      await screen.findByRole("link", { name: dict.nav.permissions }),
    ).toHaveAttribute("href", "/settings/permissions");
    expect(
      screen.getByRole("link", { name: dict.nav.auditLog }),
    ).toHaveAttribute("href", "/audit-log");
  });

  it("requires the whole content set for «Де що на сайті» — a partial grant would render 403s", async () => {
    mockCounters({ newOrders: 0, pendingReviews: 0, unread: 0 });

    renderNav({ isOwner: false, permissions: ["blog:write"] });

    await screen.findByRole("link", { name: dict.nav.blog });
    expect(
      screen.queryByRole("link", { name: dict.nav.contentMap }),
    ).not.toBeInTheDocument();
  });

  it("does not fetch the badge counters a manager cannot read", async () => {
    let needsActionCalls = 0;
    let unreadCalls = 0;
    server.use(
      http.get("*/api/admin/dashboard/needs-action", () => {
        needsActionCalls += 1;
        return HttpResponse.json({ data: {} }, { status: 403 });
      }),
      http.get("*/api/contact/admin/unread-count", () => {
        unreadCalls += 1;
        return HttpResponse.json({ data: {} }, { status: 403 });
      }),
    );

    renderNav({ isOwner: false, permissions: ["blog:write"] });

    await screen.findByRole("link", { name: dict.nav.blog });
    expect(needsActionCalls).toBe(0);
    expect(unreadCalls).toBe(0);
  });
});
