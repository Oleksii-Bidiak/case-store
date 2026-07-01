import { Separator } from "@store/store-client";

export const Horizontal = () => (
  <div style={{ maxWidth: 320 }}>
    <div style={{ paddingBottom: 8, fontSize: 14 }}>Order summary</div>
    <Separator />
    <div style={{ paddingTop: 8, fontSize: 14, color: "var(--color-muted-foreground)" }}>
      Subtotal, shipping & total
    </div>
  </div>
);

export const Vertical = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, height: 24, fontSize: 14 }}>
    <span>Home</span>
    <Separator orientation="vertical" />
    <span>Catalog</span>
    <Separator orientation="vertical" />
    <span>Cart</span>
  </div>
);
