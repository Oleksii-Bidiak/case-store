import { SheetFooter, Button } from "@store/store-client";

// SheetFooter is a plain layout block (mt-auto, stacked actions).
export const Default = () => (
  <div style={{ width: 320, border: "1px solid var(--color-border)", borderRadius: 8 }}>
    <SheetFooter>
      <Button style={{ width: "100%" }}>Checkout</Button>
      <Button variant="outline" style={{ width: "100%" }}>
        Continue shopping
      </Button>
    </SheetFooter>
  </div>
);
