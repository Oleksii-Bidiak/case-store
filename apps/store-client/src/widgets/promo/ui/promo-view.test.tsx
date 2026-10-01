import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { PromoView } from "./promo-view";

const d = dict.promo;

describe("PromoView", () => {
  beforeEach(() => {
    server.use(
      http.get("*/api/discounts/active", () =>
        HttpResponse.json({
          data: [
            {
              code: "SUMMER10",
              type: "PERCENT",
              value: "10",
              minSpend: "500.00",
              expiresAt: null,
            },
          ],
        }),
      ),
    );
  });

  it("renders the hero, coupon codes and the countdown", async () => {
    renderWithProviders(<PromoView />);

    expect(
      screen.getByRole("heading", { level: 1, name: d.hero.heading }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: d.couponsHeading }),
    ).toBeInTheDocument();
    // The coupon code comes from the live active-discounts feed (TASK-179).
    expect(await screen.findByText("SUMMER10")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  // TASK-1301 — the deals are the catalogue listing, composed by the route
  // and handed in; the view owns only the section, its heading and the
  // hero CTA's `#deals` anchor.
  it("renders the deals slot under its heading, at the hero CTA's anchor", () => {
    renderWithProviders(<PromoView deals={<p>listing</p>} />);

    const section = screen.getByRole("region", { name: d.dealsHeading });
    expect(section).toHaveAttribute("id", "deals");
    expect(section).toHaveTextContent("listing");
    expect(screen.getByRole("link", { name: d.hero.cta })).toHaveAttribute(
      "href",
      "#deals",
    );
  });

  it("subscribes to the newsletter and shows the success message", async () => {
    server.use(
      http.post("*/api/newsletter/subscribe", () =>
        HttpResponse.json({ data: { subscribed: true } }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<PromoView />);

    await user.type(
      screen.getByRole("textbox", { name: dict.newsletterForm.emailLabel }),
      "shopper@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: dict.newsletterForm.submit }),
    );

    expect(
      await screen.findByText(dict.newsletterForm.success),
    ).toBeInTheDocument();
  });
});
