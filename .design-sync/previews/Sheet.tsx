import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
  ProductThumb,
} from "@store/store-client";

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  fontSize: 14,
};

// Rendered open so the slide-out panel is visible in the card (cardMode: single).
export const CartDrawer = () => (
  <Sheet open>
    <SheetContent side="right">
      <SheetHeader>
        <SheetTitle>Кошик</SheetTitle>
        <SheetDescription>2 товари · 1 198 ₴</SheetDescription>
      </SheetHeader>
      <div style={{ display: "grid", gap: 12, padding: "0 16px" }}>
        <div style={row}>
          <ProductThumb name="Зарядка MagSafe" className="size-12 rounded-lg" />
          <span style={{ flex: 1 }}>Бездротова зарядка MagSafe 15 Вт</span>
          <b>899 ₴</b>
        </div>
        <div style={row}>
          <ProductThumb name="Кабель USB-C" className="size-12 rounded-lg" />
          <span style={{ flex: 1 }}>Кабель USB-C → USB-C 2 м</span>
          <b>299 ₴</b>
        </div>
      </div>
      <SheetFooter>
        <Button style={{ width: "100%" }}>Оформити замовлення</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);
