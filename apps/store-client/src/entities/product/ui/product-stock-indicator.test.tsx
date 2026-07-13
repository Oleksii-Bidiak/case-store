import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { ProductStockIndicator } from "./product-stock-indicator";

describe("ProductStockIndicator", () => {
  it("renders the out-of-stock label when not in stock", () => {
    renderWithProviders(
      <ProductStockIndicator inStock={false} lowStock={false} />,
    );
    expect(screen.getByText(dict.product.outOfStock)).toBeInTheDocument();
  });

  it("renders the low-stock label without leaking a raw quantity", () => {
    renderWithProviders(
      <ProductStockIndicator inStock={true} lowStock={true} />,
    );
    expect(screen.getByText(dict.product.lowStock)).toBeInTheDocument();
    // No raw unit count must ever appear (e.g. "3 шт.").
    expect(screen.queryByText(/\d+\s*шт/)).toBeNull();
  });

  it("renders the in-stock label when in stock and not low", () => {
    renderWithProviders(
      <ProductStockIndicator inStock={true} lowStock={false} />,
    );
    expect(screen.getByText(dict.product.inStockLabel)).toBeInTheDocument();
    expect(screen.queryByText(dict.product.lowStock)).toBeNull();
    expect(screen.queryByText(dict.product.outOfStock)).toBeNull();
  });
});
