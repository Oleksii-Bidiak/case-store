import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from "@store/store-client";

// Rendered open so the modal surface is visible in the card (cardMode: single).
export const Open = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Remove from cart?</DialogTitle>
        <DialogDescription>
          This removes “Braided USB-C Cable 2m” from your cart. You can add it
          again at any time.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline">Keep it</Button>
        <Button variant="destructive">Remove</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
