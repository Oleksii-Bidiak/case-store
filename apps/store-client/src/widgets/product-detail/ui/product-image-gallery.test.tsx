import type { ProductImageEntity } from "@/entities/product";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { ProductImageGallery } from "./product-image-gallery";

const image = (id: string, sortOrder: number): ProductImageEntity => ({
  id,
  url: `https://cdn.example.com/${id}.jpg`,
  alt: `Image ${id}`,
  sortOrder,
  isPrimary: sortOrder === 0,
});

/**
 * Regression guard for TASK-126: the thumbnail strip is intentionally gated on
 * `images.length > 1`. A single image shows the main image with no strip (a lone
 * thumbnail duplicating the main image would be redundant) — this is correct
 * design, not the reported bug. The "missing thumbnails" report was a seed-data
 * gap (most products seeded with one image), deferred to TASK-128.
 */
describe("ProductImageGallery — thumbnail strip gate (TASK-126)", () => {
  it("renders no thumbnail strip for a single image", () => {
    renderWithProviders(
      <ProductImageGallery images={[image("a", 0)]} altFallback="Product" />,
    );

    // Main image present, but no thumbnail buttons.
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a thumbnail button per image when there are several", () => {
    renderWithProviders(
      <ProductImageGallery
        images={[image("a", 0), image("b", 1), image("c", 2)]}
        altFallback="Product"
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("swaps the active thumbnail on click (aria-pressed follows selection)", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProductImageGallery
        images={[image("a", 0), image("b", 1)]}
        altFallback="Product"
      />,
    );

    const [first, second] = screen.getAllByRole("button");
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(second).toHaveAttribute("aria-pressed", "false");

    await user.click(second);

    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(second).toHaveAttribute("aria-pressed", "true");
  });
});
