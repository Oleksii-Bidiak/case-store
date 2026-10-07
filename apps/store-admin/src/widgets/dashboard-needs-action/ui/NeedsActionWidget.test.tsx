import { http, HttpResponse } from "msw";
import {
  render,
  renderWithProviders,
  screen,
  userEvent,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { NeedsActionWidget } from "./NeedsActionWidget";
import { NeedsActionWidgetSkeleton } from "./NeedsActionWidgetSkeleton";

interface NeedsActionCounts {
  newOrders: number;
  pendingReviews: number;
  unpaidInTransit: number;
  failedMails: number;
  /** TASK-1090 — FAILED Telegram rows, counted apart from mail. */
  failedTelegram?: number;
  pendingOver48h: number;
  /** TASK-446 — situations worth opening, not a count of reviews. */
  ratingAbuse?: number;
  /** TASK-470 — orders holding a line that can no longer be supplied. */
  unavailableItems?: number;
  /** TASK-352 — late-paid orders still cancelled. */
  paidAfterCancel?: number;
  /** TASK-601 — the situations `ratingAbuse` counted, by name. */
  ratingAbuseSignals?: { productIds: string[]; createdIps: string[] };
}

function mockNeedsAction(counts: NeedsActionCounts) {
  server.use(
    http.get("*/api/admin/dashboard/needs-action", () =>
      HttpResponse.json({
        data: {
          failedTelegram: 0,
          ratingAbuse: 0,
          ratingAbuseSignals: { productIds: [], createdIps: [] },
          unavailableItems: 0,
          paidAfterCancel: 0,
          ...counts,
        },
      }),
    ),
  );
}

describe("NeedsActionWidget (TASK-248)", () => {
  it("renders every counter as a card", async () => {
    mockNeedsAction({
      newOrders: 3,
      pendingReviews: 0,
      unpaidInTransit: 5,
      failedMails: 0,
      pendingOver48h: 0,
    });

    renderWithProviders(<NeedsActionWidget />);

    expect(
      await screen.findByText(dict.dashboard.needsActionNewOrders),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.dashboard.needsActionPendingReviews),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.dashboard.needsActionUnpaidInTransit),
    ).toBeInTheDocument();
    // TASK-251: the 5th ">48h in PENDING" card.
    expect(
      screen.getByText(dict.dashboard.needsActionPendingOver48h),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.dashboard.needsActionFailedMails),
    ).toBeInTheDocument();
    // TASK-446: the 6th card.
    expect(
      screen.getByText(dict.dashboard.needsActionRatingAbuse),
    ).toBeInTheDocument();
    // TASK-470: the 7th.
    expect(
      screen.getByText(dict.dashboard.needsActionUnavailableItems),
    ).toBeInTheDocument();
  });

  /**
   * TASK-446. `ratingAbuse` counts SITUATIONS worth opening — a product that
   * collected a burst of ratings in an hour, an address behind a run of 1★ — and
   * the place to look at them is the reviews screen.
   */
  it("deep-links the rating-abuse card to the reviews screen for a moderator", async () => {
    mockNeedsAction({
      newOrders: 0,
      pendingReviews: 0,
      unpaidInTransit: 0,
      failedMails: 0,
      pendingOver48h: 0,
      ratingAbuse: 4,
      ratingAbuseSignals: {
        productIds: ["p-1", "p-2"],
        createdIps: ["10.0.0.1", "10.0.0.2"],
      },
    });

    renderWithProviders(<NeedsActionWidget />, {
      auth: { permissions: ["analytics:read", "reviews:moderate"] },
    });

    const link = (
      await screen.findByText(dict.dashboard.needsActionRatingAbuse)
    ).closest("a") as HTMLElement;
    // Several situations → the whole screen, every queue (TASK-601).
    expect(link).toHaveAttribute("href", "/reviews?status=all");
    expect(within(link).getByText("4")).toHaveClass("text-warning");
  });

  it("deep-links the first four cards and leaves the failed-mail card non-interactive", async () => {
    mockNeedsAction({
      newOrders: 3,
      pendingReviews: 2,
      unpaidInTransit: 5,
      failedMails: 1,
      pendingOver48h: 2,
    });

    renderWithProviders(<NeedsActionWidget />);

    const newOrdersLink = await screen.findByRole("link", {
      name: new RegExp(dict.dashboard.needsActionNewOrders),
    });
    expect(newOrdersLink).toHaveAttribute("href", "/orders?status=PENDING");

    const reviewsLink = screen.getByRole("link", {
      name: new RegExp(dict.dashboard.needsActionPendingReviews),
    });
    expect(reviewsLink).toHaveAttribute("href", "/reviews?status=pending");

    const inTransitLink = screen.getByRole("link", {
      name: new RegExp(dict.dashboard.needsActionUnpaidInTransit),
    });
    expect(inTransitLink).toHaveAttribute(
      "href",
      "/orders?unpaidInTransit=true",
    );

    // TASK-251 / TASK-607: the ">48h in PENDING" card deep-links to the list
    // filtered by the SAME predicate it counts (`pendingOverdue`), not to every
    // PENDING order. Its label contains regex-special chars, so match the text
    // node and walk to the enclosing anchor rather than building a RegExp.
    const pendingOver48hLink = screen
      .getByText(dict.dashboard.needsActionPendingOver48h)
      .closest("a") as HTMLElement;
    expect(pendingOver48hLink).toHaveAttribute(
      "href",
      "/orders?pendingOverdue=true",
    );
    // Its count is toned as a warning (non-zero).
    expect(within(pendingOver48hLink).getByText("2")).toHaveClass(
      "text-warning",
    );

    // The failed-mail card has no admin destination → it is not a link.
    expect(
      screen.queryByRole("link", {
        name: new RegExp(dict.dashboard.needsActionFailedMails),
      }),
    ).not.toBeInTheDocument();
  });

  it("tones a non-zero count as a warning and a zero count as de-emphasized", async () => {
    mockNeedsAction({
      newOrders: 3,
      pendingReviews: 0,
      unpaidInTransit: 5,
      failedMails: 0,
      pendingOver48h: 0,
    });

    renderWithProviders(<NeedsActionWidget />);

    const newOrdersLink = await screen.findByRole("link", {
      name: new RegExp(dict.dashboard.needsActionNewOrders),
    });
    // Something to act on → amber warning tone.
    expect(within(newOrdersLink).getByText("3")).toHaveClass("text-warning");

    const reviewsLink = screen.getByRole("link", {
      name: new RegExp(dict.dashboard.needsActionPendingReviews),
    });
    // Nothing pending → muted/de-emphasized tone.
    expect(within(reviewsLink).getByText("0")).toHaveClass(
      "text-muted-foreground",
    );
  });

  it("shows the 'all clear' copy when every counter is zero", async () => {
    mockNeedsAction({
      newOrders: 0,
      pendingReviews: 0,
      unpaidInTransit: 0,
      failedMails: 0,
      pendingOver48h: 0,
      ratingAbuse: 0,
    });

    renderWithProviders(<NeedsActionWidget />);

    expect(
      await screen.findByText(dict.dashboard.needsActionAllClear),
    ).toBeInTheDocument();
  });

  /**
   * TASK-446. A counter that renders but sits outside `nothingToDo` is the worst
   * of both worlds: the widget shows a non-zero number AND tells the owner there
   * is nothing to do, and the number is the one they would never have thought to
   * look for on their own.
   */
  it("withholds 'all clear' while rating abuse is the only signal", async () => {
    mockNeedsAction({
      newOrders: 0,
      pendingReviews: 0,
      unpaidInTransit: 0,
      failedMails: 0,
      pendingOver48h: 0,
      ratingAbuse: 2,
    });

    renderWithProviders(<NeedsActionWidget />);

    await screen.findByText(dict.dashboard.needsActionRatingAbuse);
    expect(
      screen.queryByText(dict.dashboard.needsActionAllClear),
    ).not.toBeInTheDocument();
  });

  /**
   * The «Недоступні позиції» tile (TASK-470).
   *
   * The aggregate of the fourth mark of B-1 §3, and the ONLY notification there
   * is: the owner decided the buyer hears about a missing position from a
   * person, never from an automatic mail. That makes the two properties below
   * load-bearing rather than cosmetic — a tile nobody can click through, or one
   * that an «Все під контролем» prints over, is a signal that reaches nobody.
   */
  describe("the «Недоступні позиції» tile (TASK-470)", () => {
    it("renders as the seventh card", async () => {
      mockNeedsAction({
        newOrders: 0,
        pendingReviews: 0,
        unpaidInTransit: 0,
        failedMails: 0,
        pendingOver48h: 0,
        unavailableItems: 4,
      });

      renderWithProviders(<NeedsActionWidget />);

      const link = await screen.findByRole("link", {
        name: new RegExp(dict.dashboard.needsActionUnavailableItems),
      });
      expect(within(link).getByText("4")).toHaveClass("text-warning");
    });

    it("deep-links to the list filtered by the SAME predicate it counts", async () => {
      mockNeedsAction({
        newOrders: 0,
        pendingReviews: 0,
        unpaidInTransit: 0,
        failedMails: 0,
        pendingOver48h: 0,
        unavailableItems: 2,
      });

      renderWithProviders(<NeedsActionWidget />);

      const link = await screen.findByRole("link", {
        name: new RegExp(dict.dashboard.needsActionUnavailableItems),
      });
      // Not an approximation of the predicate — the predicate. A tile whose
      // number and whose click-through disagree teaches an operator to distrust
      // both.
      expect(link).toHaveAttribute("href", "/orders?hasUnavailableItems=true");
    });

    it("withholds 'all clear' while it is the only signal", async () => {
      mockNeedsAction({
        newOrders: 0,
        pendingReviews: 0,
        unpaidInTransit: 0,
        failedMails: 0,
        pendingOver48h: 0,
        ratingAbuse: 0,
        unavailableItems: 1,
      });

      renderWithProviders(<NeedsActionWidget />);

      await screen.findByText(dict.dashboard.needsActionUnavailableItems);
      expect(
        screen.queryByText(dict.dashboard.needsActionAllClear),
      ).not.toBeInTheDocument();
    });
  });

  /**
   * «Оплачено після скасування» (TASK-352 (c), decision B-11 №3): a late
   * payment on an order the TTL already cancelled. Nothing is refunded or
   * revived automatically — this tile is how the operator finds out.
   */
  describe("the «Оплачено після скасування» tile (TASK-352)", () => {
    const quiet = {
      newOrders: 0,
      pendingReviews: 0,
      unpaidInTransit: 0,
      failedMails: 0,
      pendingOver48h: 0,
    };

    it("deep-links to the list filtered by the same predicate it counts", async () => {
      mockNeedsAction({ ...quiet, paidAfterCancel: 2 });

      renderWithProviders(<NeedsActionWidget />);

      const link = await screen.findByRole("link", {
        name: new RegExp(dict.dashboard.needsActionPaidAfterCancel),
      });
      expect(link).toHaveAttribute("href", "/orders?paidAfterCancel=true");
      expect(within(link).getByText("2")).toHaveClass("text-warning");
    });

    it("withholds 'all clear' while it is the only signal", async () => {
      mockNeedsAction({ ...quiet, paidAfterCancel: 1 });

      renderWithProviders(<NeedsActionWidget />);

      await screen.findByText(dict.dashboard.needsActionPaidAfterCancel);
      expect(
        screen.queryByText(dict.dashboard.needsActionAllClear),
      ).not.toBeInTheDocument();
    });
  });

  /**
   * TASK-613 (E-22): a new return request signals from the dashboard. The count
   * is `meta.total` of the returns queue under `returns:read` — not a field on
   * the analytics-gated needs-action payload — so a session without the right
   * never asks for it and never sees the tile.
   */
  describe("the «Нові заявки на повернення» tile (TASK-613)", () => {
    const quiet = {
      newOrders: 0,
      pendingReviews: 0,
      unpaidInTransit: 0,
      failedMails: 0,
      pendingOver48h: 0,
    };

    function mockReturns(total: number, seen: string[] = []) {
      server.use(
        http.get("*/api/admin/returns", ({ request }) => {
          seen.push(new URL(request.url).search);
          return HttpResponse.json({
            data: [],
            meta: { total, page: 1, limit: 1, totalPages: total },
          });
        }),
      );
      return seen;
    }

    it("counts REQUESTED returns and deep-links to the queue on that filter", async () => {
      mockNeedsAction(quiet);
      const seen = mockReturns(3);

      renderWithProviders(<NeedsActionWidget />, {
        auth: { permissions: ["analytics:read", "returns:read"] },
      });

      const link = (
        await screen.findByText(dict.dashboard.needsActionNewReturns)
      ).closest("a") as HTMLElement;
      expect(link).toHaveAttribute("href", "/returns?status=REQUESTED");
      expect(await within(link).findByText("3")).toHaveClass("text-warning");
      // One row is enough — only `meta.total` is read.
      expect(seen.join(" ")).toContain("status=REQUESTED");
      expect(seen.join(" ")).toContain("limit=1");
    });

    it("withholds «all clear» while a new return is the only signal", async () => {
      mockNeedsAction(quiet);
      mockReturns(1);

      renderWithProviders(<NeedsActionWidget />, {
        auth: { permissions: ["analytics:read", "returns:read"] },
      });

      const link = (
        await screen.findByText(dict.dashboard.needsActionNewReturns)
      ).closest("a") as HTMLElement;
      await within(link).findByText("1");
      expect(
        screen.queryByText(dict.dashboard.needsActionAllClear),
      ).not.toBeInTheDocument();
    });

    it("still says «all clear» when the queue is empty", async () => {
      mockNeedsAction(quiet);
      mockReturns(0);

      renderWithProviders(<NeedsActionWidget />, {
        auth: { permissions: ["analytics:read", "returns:read"] },
      });

      expect(
        await screen.findByText(dict.dashboard.needsActionAllClear),
      ).toBeInTheDocument();
    });

    /**
     * The count is its own request. When it fails, a «0» on the tile would say
     * «no new returns» about a queue nobody managed to read — and the tile must
     * not unlock «all clear» either.
     */
    it("shows a placeholder, not «0», and withholds «all clear» when the returns list fails", async () => {
      mockNeedsAction(quiet);
      let calls = 0;
      server.use(
        http.get("*/api/admin/returns", () => {
          calls += 1;
          return HttpResponse.json(
            {
              error: "Internal Server Error",
              message: "boom",
              statusCode: 500,
            },
            { status: 500 },
          );
        }),
      );

      renderWithProviders(<NeedsActionWidget />, {
        auth: { permissions: ["analytics:read", "returns:read"] },
      });

      const link = (
        await screen.findByText(dict.dashboard.needsActionNewReturns)
      ).closest("a") as HTMLElement;
      expect(
        await within(link).findByText(dict.dashboard.needsActionCountFailed),
      ).toBeInTheDocument();
      expect(calls).toBeGreaterThan(0);
      expect(within(link).getByText("—")).toBeInTheDocument();
      expect(within(link).queryByText("0")).not.toBeInTheDocument();
      expect(
        screen.queryByText(dict.dashboard.needsActionAllClear),
      ).not.toBeInTheDocument();
    });

    it("shows a placeholder, not «0», while the returns list has not answered", async () => {
      mockNeedsAction(quiet);
      server.use(
        http.get("*/api/admin/returns", () => new Promise<Response>(() => {})),
      );

      renderWithProviders(<NeedsActionWidget />, {
        auth: { permissions: ["analytics:read", "returns:read"] },
      });

      const link = (
        await screen.findByText(dict.dashboard.needsActionNewReturns)
      ).closest("a") as HTMLElement;
      expect(
        within(link).getByText(dict.dashboard.needsActionCountPending),
      ).toBeInTheDocument();
      expect(within(link).queryByText("0")).not.toBeInTheDocument();
      expect(
        screen.queryByText(dict.dashboard.needsActionAllClear),
      ).not.toBeInTheDocument();
    });

    it("has no tile and makes no request without returns:read", async () => {
      mockNeedsAction(quiet);
      const seen = mockReturns(5);

      renderWithProviders(<NeedsActionWidget />, {
        auth: { permissions: ["analytics:read"] },
      });

      await screen.findByText(dict.dashboard.needsActionNewOrders);
      expect(
        screen.queryByText(dict.dashboard.needsActionNewReturns),
      ).not.toBeInTheDocument();
      expect(seen).toHaveLength(0);
    });
  });

  /**
   * TASK-601 (UI part, row TASK-1004): the rating-abuse card opens the series
   * it counted when there is exactly one, and never puts an IP address in a
   * link for a session that cannot moderate reviews.
   */
  describe("the rating-abuse card link (TASK-601)", () => {
    const quiet = {
      newOrders: 0,
      pendingReviews: 0,
      unpaidInTransit: 0,
      failedMails: 0,
      pendingOver48h: 0,
    };
    const MODERATOR = {
      auth: { permissions: ["analytics:read", "reviews:moderate"] },
    };

    async function cardLink() {
      return (
        await screen.findByText(dict.dashboard.needsActionRatingAbuse)
      ).closest("a");
    }

    it("opens the one flagged product across every queue", async () => {
      mockNeedsAction({
        ...quiet,
        ratingAbuse: 1,
        ratingAbuseSignals: { productIds: ["prod-uuid-1"], createdIps: [] },
      });
      renderWithProviders(<NeedsActionWidget />, MODERATOR);

      expect(await cardLink()).toHaveAttribute(
        "href",
        "/reviews?status=all&productId=prod-uuid-1",
      );
    });

    it("opens the one flagged address across every queue", async () => {
      mockNeedsAction({
        ...quiet,
        ratingAbuse: 1,
        ratingAbuseSignals: { productIds: [], createdIps: ["2001:db8::1"] },
      });
      renderWithProviders(<NeedsActionWidget />, MODERATOR);

      expect(await cardLink()).toHaveAttribute(
        "href",
        `/reviews?status=all&createdIp=${encodeURIComponent("2001:db8::1")}`,
      );
    });

    it("opens the unfiltered screen for a product AND an address — one filter cannot show both", async () => {
      mockNeedsAction({
        ...quiet,
        ratingAbuse: 2,
        ratingAbuseSignals: {
          productIds: ["prod-uuid-1"],
          createdIps: ["10.0.0.7"],
        },
      });
      renderWithProviders(<NeedsActionWidget />, MODERATOR);

      expect(await cardLink()).toHaveAttribute("href", "/reviews?status=all");
    });

    it("opens the unfiltered screen when nothing is flagged", async () => {
      mockNeedsAction(quiet);
      renderWithProviders(<NeedsActionWidget />, MODERATOR);

      expect(await cardLink()).toHaveAttribute("href", "/reviews?status=all");
    });

    it("is not a link — and leaks no IP — without reviews:moderate", async () => {
      mockNeedsAction({
        ...quiet,
        ratingAbuse: 1,
        ratingAbuseSignals: { productIds: [], createdIps: ["10.0.0.7"] },
      });
      const { container } = renderWithProviders(<NeedsActionWidget />, {
        auth: { permissions: ["analytics:read"] },
      });

      expect(await cardLink()).toBeNull();
      expect(container.innerHTML).not.toContain("10.0.0.7");
    });
  });
});

/**
 * TASK-1037 (П4): a failed list is a bar with «Повторити» — the click asks
 * again, and the cards appear once it answers.
 */
describe("NeedsActionWidget — load failure (TASK-1037)", () => {
  it("shows «Не вдалося завантажити список дій.» with «Повторити», which refetches", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/admin/dashboard/needs-action", () => {
        calls += 1;
        return HttpResponse.json(
          { error: "Internal Server Error", message: "boom", statusCode: 500 },
          { status: 500 },
        );
      }),
    );

    renderWithProviders(<NeedsActionWidget />, {
      auth: { permissions: ["analytics:read"] },
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(dict.dashboard.needsActionLoadError);
    expect(calls).toBe(1);

    mockNeedsAction({
      newOrders: 1,
      pendingReviews: 0,
      unpaidInTransit: 0,
      failedMails: 0,
      pendingOver48h: 0,
    });
    await userEvent.click(
      within(alert).getByRole("button", { name: dict.canon.retry }),
    );
    expect(
      await screen.findByText(dict.dashboard.needsActionNewOrders),
    ).toBeInTheDocument();
  });
});

/**
 * TASK-1090: failed Telegram notifications are their own tile — `failedMails`
 * counts e-mail only — and the tile opens /settings/notifications for a session
 * that may open it.
 */
describe("NeedsActionWidget — «Telegram не доставив» (TASK-1090)", () => {
  const quiet = {
    newOrders: 0,
    pendingReviews: 0,
    unpaidInTransit: 0,
    failedMails: 0,
    pendingOver48h: 0,
  };

  it("counts failed Telegram apart from failed mail", async () => {
    mockNeedsAction({ ...quiet, failedMails: 1, failedTelegram: 3 });

    renderWithProviders(<NeedsActionWidget />, {
      auth: { permissions: ["analytics:read", "settings:notifications"] },
    });

    const link = (
      await screen.findByText(dict.dashboard.needsActionFailedTelegram)
    ).closest("a") as HTMLElement;
    expect(link).toHaveAttribute("href", "/settings/notifications");
    expect(within(link).getByText("3")).toHaveClass("text-warning");

    // The mail tile keeps its own count and stays a plain stat.
    const mail = screen
      .getByText(dict.dashboard.needsActionFailedMails)
      .closest("div") as HTMLElement;
    expect(within(mail).getByText("1")).toBeInTheDocument();
  });

  it("is a plain stat without settings:notifications", async () => {
    mockNeedsAction({ ...quiet, failedTelegram: 2 });

    renderWithProviders(<NeedsActionWidget />, {
      auth: { permissions: ["analytics:read"] },
    });

    expect(
      (
        await screen.findByText(dict.dashboard.needsActionFailedTelegram)
      ).closest("a"),
    ).toBeNull();
  });

  it("withholds 'all clear' while failed Telegram is the only signal", async () => {
    mockNeedsAction({ ...quiet, failedTelegram: 1 });

    renderWithProviders(<NeedsActionWidget />);

    await screen.findByText(dict.dashboard.needsActionFailedTelegram);
    expect(
      screen.queryByText(dict.dashboard.needsActionAllClear),
    ).not.toBeInTheDocument();
  });
});

/**
 * TASK-1037 (П3): the skeleton has the loaded widget's shape — ten cards in
 * five columns with the returns tile, nine in three without it (TASK-1090).
 */
describe("NeedsActionWidgetSkeleton (TASK-1037)", () => {
  it("draws ten cards in five columns with the returns tile", () => {
    const { container } = render(<NeedsActionWidgetSkeleton withReturns />);

    const cards = container.querySelectorAll(
      "[data-slot='needs-action-skeleton']",
    );
    expect(cards).toHaveLength(10);
    expect(cards[0].parentElement).toHaveClass("xl:grid-cols-5");
    expect(cards[0].parentElement).not.toHaveClass("lg:grid-cols-5");
  });

  it("draws nine cards in three columns without it", () => {
    const { container } = render(<NeedsActionWidgetSkeleton />);

    const cards = container.querySelectorAll(
      "[data-slot='needs-action-skeleton']",
    );
    expect(cards).toHaveLength(9);
    expect(cards[0].parentElement).toHaveClass("lg:grid-cols-3");
  });
});
