import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
} from "@store/store-client";

// Rendered open so the slide-out panel is visible in the card (cardMode: single).
export const CartDrawer = () => (
  <Sheet open>
    <SheetContent side="right">
      <SheetHeader>
        <SheetTitle>Your cart</SheetTitle>
        <SheetDescription>2 items · 598 ₴</SheetDescription>
      </SheetHeader>
      <div
        style={{
          padding: "0 16px",
          fontSize: 14,
          color: "var(--color-muted-foreground)",
        }}
      >
        Cart items would be listed here.
      </div>
      <SheetFooter>
        <Button style={{ width: "100%" }}>Checkout</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);
