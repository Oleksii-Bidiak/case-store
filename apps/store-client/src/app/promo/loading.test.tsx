import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import Loading from "./loading";
import PromoLayout from "./layout";

/** The layout is an async server component (it prefetches the coupons). */
const renderFrame = async () =>
  renderWithProviders(await PromoLayout({ children: <Loading /> }));

const ONE_COUPON = {
  data: [
    {
      code: "SUMMER10",
      type: "PERCENT",
      value: "10",
      minSpend: "500.00",
      expiresAt: null,
    },
  ],
};

/**
 * TASK-869 — `/promo` had no loading boundary, so entering it from another page
 * froze the old page until the server prefetch returned. The static frame is
 * now the segment layout and `loading.tsx` stands in for the listing only:
 * Next nests the boundary INSIDE the layout, so what the shopper sees while
 * the deals load is the real hero and coupons over the catalogue skeleton.
 */
describe("/promo loading boundary (TASK-869)", () => {
  beforeEach(() => {
    server.use(
      http.get("*/api/discounts/active", () => HttpResponse.json({ data: [] })),
    );
  });

  it("paints the real frame around the loading listing", async () => {
    await renderFrame();

    // The hero heading is real, not a placeholder — one h1 on the page.
    expect(
      screen.getByRole("heading", { level: 1, name: dict.promo.hero.heading }),
    ).toBeInTheDocument();
    // The skeleton sits in the deals section, at the hero CTA's anchor.
    const deals = screen.getByRole("region", {
      name: dict.promo.dealsHeading,
    });
    expect(deals).toHaveAttribute("id", "deals");
    expect(
      deals.querySelector('[data-testid="filter-rail-skeleton"]'),
    ).not.toBeNull();
  });

  it("draws the locked rail — no «Знижки», the route fixes the discount", () => {
    renderWithProviders(<Loading />);

    const sections = [
      ...screen
        .getByTestId("filter-rail-skeleton")
        .querySelectorAll("[data-section]"),
    ].map((card) => card.getAttribute("data-section"));
    expect(sections).not.toContain("onSale");
    expect(sections).not.toContain("specs");
  });

  it("keeps the page container on the layout, so loading and page share it", async () => {
    const { container } = await renderFrame();

    expect(container.firstElementChild).toHaveClass("max-w-page", "pt-5.5");
  });

  // Fix round — a ticket's height depends on where its text wraps (126.5 /
  // 146.5 / 163px across widths), so no fixed placeholder matches it. The
  // layout prefetches the feed: the FIRST render already holds the tickets and
  // nothing below them moves when the client takes over.
  it("renders the coupons with the frame — no placeholder to swap", async () => {
    server.use(
      http.get("*/api/discounts/active", () => HttpResponse.json(ONE_COUPON)),
    );

    await renderFrame();

    // Synchronous query: present in the first render, not after a fetch.
    expect(screen.getByText("SUMMER10")).toBeInTheDocument();
    expect(screen.queryAllByTestId("promo-coupon-skeleton")).toHaveLength(0);
    // Floored at the placeholder's height for the fallback path below.
    expect(screen.getByTestId("promo-coupon")).toHaveClass("min-h-32");
  });

  it("falls back to the client fetch behind a ticket-height placeholder", async () => {
    server.use(
      http.get("*/api/discounts/active", () =>
        HttpResponse.json({ message: "down" }, { status: 503 }),
      ),
    );

    await renderFrame();

    const placeholders = screen.getAllByTestId("promo-coupon-skeleton");
    expect(placeholders).toHaveLength(3);
    // The same 128px the ticket card is floored at (`min-h-32`).
    placeholders.forEach((p) => expect(p).toHaveClass("h-32"));
  });
});
