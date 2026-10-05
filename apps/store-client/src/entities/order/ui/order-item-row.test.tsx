import { renderWithProviders, screen, fireEvent } from "@/shared/test/render";
import { makeOrderItem } from "@/shared/test/msw-handlers";
import { OrderItemRow } from "./order-item-row";

function renderRow(item = makeOrderItem()) {
  return renderWithProviders(
    <ul>
      <OrderItemRow item={item} />
    </ul>,
  );
}

describe("OrderItemRow (TASK-134, TASK-217)", () => {
  it("links the product name to the PDP — one link per product for AT", () => {
    const { container } = renderRow(
      makeOrderItem({
        productName: "Ordered Item",
        productSlug: "ordered-item",
        imageUrl: "https://cdn.example.com/ordered-item.jpg",
      }),
    );

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Ordered Item");
    expect(links[0]).toHaveAttribute("href", "/products/ordered-item");

    // The thumbnail repeats the link for the pointer only.
    const thumbLink = container.querySelector('a[tabindex="-1"]');
    expect(thumbLink).toHaveAttribute("href", "/products/ordered-item");
    expect(thumbLink).toHaveAttribute("aria-hidden", "true");
    // `next/image` rewrites the src to the optimizer URL; the original URL is
    // carried in the encoded `url` query param. Decorative: the name is text.
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute(
      "src",
      expect.stringContaining(
        encodeURIComponent("https://cdn.example.com/ordered-item.jpg"),
      ),
    );
  });

  it("falls back to the placeholder thumbnail when there is no image", () => {
    const { container } = renderRow(
      makeOrderItem({ productName: "No Image", imageUrl: null }),
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("falls back to the placeholder after the image errors", () => {
    const { container } = renderRow(
      makeOrderItem({
        productName: "Broken",
        imageUrl: "https://cdn.example.com/broken.jpg",
      }),
    );

    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows quantity × unit price, the line total and every add-on", () => {
    renderRow(
      makeOrderItem({
        quantity: 2,
        price: "299.00",
        lineTotal: "598.00",
        addons: [
          {
            id: "a1",
            addonServiceId: "s1",
            name: "Наклеєння скла",
            price: "150.00",
          },
        ],
      }),
    );

    expect(screen.getByText(/^2 × 299\s₴$/)).toBeInTheDocument();
    expect(screen.getByText(/^598\s₴$/)).toBeInTheDocument();
    expect(
      screen.getByText(/^\+ Наклеєння скла · 150\s₴$/),
    ).toBeInTheDocument();
  });
});
