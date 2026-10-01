import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import Loading from "./loading";
import PromoLayout from "./layout";

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

  it("paints the real frame around the loading listing", () => {
    renderWithProviders(
      <PromoLayout>
        <Loading />
      </PromoLayout>,
    );

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

  it("keeps the page container on the layout, so loading and page share it", () => {
    const { container } = renderWithProviders(
      <PromoLayout>
        <Loading />
      </PromoLayout>,
    );

    expect(container.firstElementChild).toHaveClass("max-w-page", "pt-5.5");
  });
});
