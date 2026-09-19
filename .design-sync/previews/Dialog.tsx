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
// Confirmations use Dialog — never window.confirm (docs/design-system.md §10).
export const Open = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Скасувати замовлення?</DialogTitle>
        <DialogDescription>
          Замовлення #A1B2C3D4 буде скасовано, а товари повернуться на склад.
          Цю дію не можна відмінити.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline">Залишити</Button>
        <Button variant="destructive">Скасувати замовлення</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
