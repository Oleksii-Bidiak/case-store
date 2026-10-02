import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { ProductTrustBadges } from "./product-trust-badges";

describe("ProductTrustBadges — delivery row (TASK-881)", () => {
  it("names the carrier's tariff instead of promising free delivery", () => {
    renderWithProviders(<ProductTrustBadges />);

    // Nova Poshta is never free (owner decision B-6 #2) and the checkout
    // prices it per city, so the buy box must not say «Безкоштовно».
    expect(
      screen.getByText(dict.product.buyBoxInfo.delivery.title),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.product.buyBoxInfo.delivery.text),
    ).toBeInTheDocument();
    expect(screen.queryByText(/безкоштовн/i)).not.toBeInTheDocument();
  });
});
