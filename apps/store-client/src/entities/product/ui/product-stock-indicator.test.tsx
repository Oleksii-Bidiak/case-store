import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { ProductStockIndicator } from "./product-stock-indicator";

describe("ProductStockIndicator (TASK-2080, Product mockup §3.4)", () => {
  it("says «Немає в наявності» in the neutral colour, never an alarm", () => {
    renderWithProviders(<ProductStockIndicator inStock={false} />);
    const line = screen.getByText(dict.product.outOfStock);
    expect(line).toHaveClass("text-muted-foreground");
    expect(line).not.toHaveClass("text-destructive");
  });

  it("says only «В наявності» in success, with a decorative dot", () => {
    renderWithProviders(<ProductStockIndicator inStock={true} />);
    const line = screen.getByText(dict.product.inStockLabel);
    expect(line).toHaveClass("text-success");
    expect(line).toHaveTextContent(/^В наявності$/);
    expect(line.querySelector("[aria-hidden='true']")).toHaveClass(
      "rounded-full",
    );
  });

  it("has no low-stock state and never leaks a raw quantity", () => {
    renderWithProviders(
      <ProductStockIndicator inStock={true} lowStock={true} />,
    );
    expect(screen.queryByText(dict.product.lowStock)).toBeNull();
    expect(screen.getByText(dict.product.inStockLabel)).toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*шт/)).toBeNull();
  });
});
