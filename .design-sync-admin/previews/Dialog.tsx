import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from "@store/store-admin";

// Rendered open so the modal surface is visible in the card (cardMode: single).
// Destructive confirmations use Dialog — never window.confirm.
export const Open = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Видалити товар?</DialogTitle>
        <DialogDescription>
          «Чохол Spigen Ultra Hybrid для iPhone 15 Pro» зникне з каталогу та
          пошуку. Історія замовлень із ним збережеться.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline">Скасувати</Button>
        <Button variant="destructive">Видалити</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
