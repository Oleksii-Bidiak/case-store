import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { CheckoutOrderSummary } from "./checkout-order-summary";
import { clearAppliedDiscount } from "@/features/apply-discount";

/**
 * The delivery estimate is a proxied Nova Poshta call, and the shipping row is
 * the only place its outcome shows. TASK-402: a failed or zero estimate used to
 * fall through to `deliveryEstimateValue` — "3–5 робочих днів" printed in a row
 * whose label reads "Доставка" and whose neighbours are all money.
 */
const authed = {
  auth: { isAuthenticated: true, accessToken: "token" },
} as const;

/** The one NP city ref that enables the estimate query. */
const CITY_REF = "city-ref-1";

describe("CheckoutOrderSummary", () => {
  beforeEach(() => {
    clearAppliedDiscount();
    window.sessionStorage.clear();
  });

  it("shows the estimated shipping cost when Nova Poshta answers", async () => {
    renderWithProviders(<CheckoutOrderSummary npCityRef={CITY_REF} />, authed);

    // 60.00 from the default handler, formatted by `formatMoney`.
    expect(await screen.findByText(/60/)).toBeInTheDocument();
    expect(screen.queryByText(dict.checkout.shippingCostUnknown)).toBeNull();
  });

  it("asks the shopper to select a city before anything is estimated", async () => {
    renderWithProviders(<CheckoutOrderSummary />, authed);

    expect(
      await screen.findByText(dict.checkout.shippingSelectCity),
    ).toBeInTheDocument();
  });

  it("says an operator will confirm the cost when the estimate fails", async () => {
    server.use(
      http.get("*/api/delivery/estimate", () =>
        HttpResponse.json(
          { statusCode: 503, message: "Nova Poshta is unavailable" },
          { status: 503 },
        ),
      ),
    );

    renderWithProviders(<CheckoutOrderSummary npCityRef={CITY_REF} />, authed);

    expect(
      await screen.findByText(dict.checkout.shippingCostUnknown),
    ).toBeInTheDocument();
    // An ETA is not a price — it must not stand in for one.
    expect(screen.queryByText(dict.checkout.deliveryEstimateValue)).toBeNull();
  });

  it("says the same for an estimate that comes back without a cost", async () => {
    server.use(
      http.get("*/api/delivery/estimate", () =>
        HttpResponse.json({ data: { cost: "0.00", etaDays: 2 } }),
      ),
    );

    renderWithProviders(<CheckoutOrderSummary npCityRef={CITY_REF} />, authed);

    expect(
      await screen.findByText(dict.checkout.shippingCostUnknown),
    ).toBeInTheDocument();
  });

  it("keeps the promo control for a guest, with the sign-in hint pointing back to checkout", async () => {
    renderWithProviders(<CheckoutOrderSummary npCityRef={CITY_REF} />);

    // The field itself stays — a shopper holding a code must see somewhere to
    // put it, even before they have an account.
    expect(
      await screen.findByLabelText(dict.discounts.inputAria),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.discounts.guestHint)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.discounts.signInCta }),
    ).toHaveAttribute("href", "/login?redirect=%2Fcheckout");
  });

  it("reports a failed cart load instead of rendering an empty summary", async () => {
    server.use(
      http.get("*/api/cart", () =>
        HttpResponse.json({ statusCode: 500 }, { status: 500 }),
      ),
    );

    renderWithProviders(<CheckoutOrderSummary />, authed);

    expect(
      await screen.findByText(dict.checkout.summaryError),
    ).toBeInTheDocument();
  });
});
