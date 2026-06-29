import { renderWithProviders, screen, fireEvent } from "@/shared/test/render";
import { makeOrderItem } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import { OrderItemRow } from "./order-item-row";

describe("OrderItemRow (TASK-134)", () => {
  it("renders the product image and links the line to the PDP", () => {
    const item = makeOrderItem({
      productName: "Ordered Item",
      productSlug: "ordered-item",
      imageUrl: "https://cdn.example.com/ordered-item.jpg",
    });

    renderWithProviders(
      <ul>
        <OrderItemRow item={item} />
      </ul>,
    );

    const link = screen.getByRole("link", {
      name: dict.order.viewProductAria("Ordered Item"),
    });
    expect(link).toHaveAttribute("href", "/products/ordered-item");
    expect(screen.getByRole("img", { name: "Ordered Item" })).toHaveAttribute(
      "src",
      "https://cdn.example.com/ordered-item.jpg",
    );
  });

  it("falls back to the placeholder thumbnail when there is no image", () => {
    const item = makeOrderItem({
      productName: "No Image",
      productSlug: "no-image",
      imageUrl: null,
    });

    renderWithProviders(
      <ul>
        <OrderItemRow item={item} />
      </ul>,
    );

    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.getByRole("link", {
        name: dict.order.viewProductAria("No Image"),
      }),
    ).toHaveAttribute("href", "/products/no-image");
  });

  it("falls back to the placeholder after the image errors", () => {
    const item = makeOrderItem({
      productName: "Broken",
      imageUrl: "https://cdn.example.com/broken.jpg",
    });

    renderWithProviders(
      <ul>
        <OrderItemRow item={item} />
      </ul>,
    );

    fireEvent.error(screen.getByRole("img", { name: "Broken" }));
    expect(screen.queryByRole("img")).toBeNull();
  });
});
