import { Button } from "@store/store-client";

export const Variants = () => (
  <div
    style={{
      display: "flex",
      gap: 12,
      flexWrap: "wrap",
      alignItems: "center",
    }}
  >
    <Button>Add to cart</Button>
    <Button variant="secondary">View details</Button>
    <Button variant="outline">Compare</Button>
    <Button variant="ghost">Save for later</Button>
    <Button variant="destructive">Remove</Button>
    <Button variant="link">Learn more</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Button size="sm">Small</Button>
    <Button size="default">Default</Button>
    <Button size="lg">Large</Button>
  </div>
);

export const Disabled = () => <Button disabled>Out of stock</Button>;
