import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { ProductSpecEntity } from "@/entities/product";
import { ProductSpecsTabs } from "./product-specs-tabs";
import { ProductHighlights } from "./product-highlights";

const spec = (over: Partial<ProductSpecEntity>): ProductSpecEntity => ({
  key: "material",
  label: "Матеріал",
  type: "SELECT",
  unit: null,
  value: "Силікон",
  isFilterable: true,
  ...over,
});

describe("ProductSpecsTabs — specs tab (TASK-191)", () => {
  it("renders real key/value rows when the product has specs", async () => {
    renderWithProviders(
      <ProductSpecsTabs
        description="desc"
        productId="p1"
        specs={[
          spec({}),
          spec({
            key: "power",
            label: "Потужність",
            type: "NUMBER",
            unit: "W",
            value: "20",
          }),
        ]}
      />,
    );

    await userEvent.click(
      screen.getByRole("tab", { name: dict.product.tabSpecs }),
    );

    expect(await screen.findByText("Матеріал")).toBeInTheDocument();
    expect(screen.getByText("Силікон")).toBeInTheDocument();
    // NUMBER value appends its unit.
    expect(screen.getByText("20 W")).toBeInTheDocument();
  });

  it("falls back to the empty-state copy when there are no specs", async () => {
    renderWithProviders(
      <ProductSpecsTabs description="desc" productId="p1" specs={[]} />,
    );

    await userEvent.click(
      screen.getByRole("tab", { name: dict.product.tabSpecs }),
    );

    expect(
      await screen.findByText(dict.product.specsEmpty),
    ).toBeInTheDocument();
  });
});

describe("ProductHighlights (TASK-191)", () => {
  it("renders the highlights strip with BOOLEAN formatted as Так/Ні", () => {
    renderWithProviders(
      <ProductHighlights
        highlights={[
          spec({
            key: "wireless",
            label: "Бездротова",
            type: "BOOLEAN",
            value: "true",
          }),
        ]}
      />,
    );

    expect(screen.getByText(dict.product.highlightsTitle)).toBeInTheDocument();
    expect(screen.getByText("Бездротова")).toBeInTheDocument();
    expect(screen.getByText(dict.product.specBooleanYes)).toBeInTheDocument();
  });

  it("renders nothing when there are no highlights", () => {
    const { container } = renderWithProviders(
      <ProductHighlights highlights={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
