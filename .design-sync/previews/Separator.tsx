import { Separator } from "@store/store-client";

export const Horizontal = () => (
  <div style={{ maxWidth: 320 }}>
    <div style={{ paddingBottom: 8, fontSize: 14 }}>Разом до сплати</div>
    <Separator />
    <div style={{ paddingTop: 8, fontSize: 14, color: "var(--color-muted-foreground)" }}>
      Товари, доставка та знижка
    </div>
  </div>
);

export const Vertical = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, height: 24, fontSize: 14 }}>
    <span>Головна</span>
    <Separator orientation="vertical" />
    <span>Каталог</span>
    <Separator orientation="vertical" />
    <span>Кошик</span>
  </div>
);
