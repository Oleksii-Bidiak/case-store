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

describe("ProductSpecsTabs — description tab (TASK-361)", () => {
  it("renders a rich-text description as real markup, not literal tags", () => {
    renderWithProviders(
      <ProductSpecsTabs
        description="<p>Захист <strong>360°</strong></p><ul><li>Матовий</li></ul>"
        productId="p1"
        specs={[]}
      />,
    );

    // The tag text itself must never reach the shopper.
    expect(screen.queryByText(/<p>/)).toBeNull();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("360°").tagName).toBe("STRONG");
    expect(screen.getByText("Матовий").tagName).toBe("LI");
  });

  // Descriptions written before the rich-text switch are plain text whose only
  // structure is their line breaks — rendering them as HTML would collapse them
  // into one paragraph.
  it("keeps a legacy plain-text description in a pre-line block", () => {
    renderWithProviders(
      <ProductSpecsTabs
        description={"Перший рядок\nДругий рядок"}
        productId="p1"
        specs={[]}
      />,
    );

    const block = screen.getByText(/Перший рядок/);
    expect(block).toHaveClass("whitespace-pre-line");
    expect(block.querySelector("p")).toBeNull();
  });

  it("shows the empty-state copy when there is no description", () => {
    renderWithProviders(
      <ProductSpecsTabs description={null} productId="p1" specs={[]} />,
    );

    expect(screen.getByText(dict.product.specsEmpty)).toBeInTheDocument();
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
