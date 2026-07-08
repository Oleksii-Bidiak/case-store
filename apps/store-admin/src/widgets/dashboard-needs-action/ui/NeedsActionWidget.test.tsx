import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, within } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { NeedsActionWidget } from "./NeedsActionWidget";

function mockNeedsAction(counts: {
  newOrders: number;
  pendingReviews: number;
  unpaidInTransit: number;
  failedMails: number;
  pendingOver48h: number;
}) {
  server.use(
    http.get("*/api/admin/dashboard/needs-action", () =>
      HttpResponse.json({ data: counts }),
    ),
  );
}

describe("NeedsActionWidget (TASK-248)", () => {
  it("renders the five counters as cards", async () => {
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

    // TASK-251: the ">48h in PENDING" card deep-links to the PENDING list. Its
    // label contains regex-special chars, so match the text node and walk to the
    // enclosing anchor rather than building a RegExp from the label.
    const pendingOver48hLink = screen
      .getByText(dict.dashboard.needsActionPendingOver48h)
      .closest("a") as HTMLElement;
    expect(pendingOver48hLink).toHaveAttribute(
      "href",
      "/orders?status=PENDING",
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
    });

    renderWithProviders(<NeedsActionWidget />);

    expect(
      await screen.findByText(dict.dashboard.needsActionAllClear),
    ).toBeInTheDocument();
  });
});
