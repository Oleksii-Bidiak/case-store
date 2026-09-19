import { PhoneInput, Label } from "@store/store-client";

export const Filled = () => (
  <div style={{ display: "grid", gap: 6, maxWidth: 300 }}>
    <Label htmlFor="phone">Телефон</Label>
    {/* Controlled UA mask: "501234567" renders as "+380 50 123 4567". */}
    <PhoneInput id="phone" value="501234567" />
  </div>
);

export const Empty = () => (
  <div style={{ display: "grid", gap: 6, maxWidth: 300 }}>
    <Label htmlFor="phone-empty">Телефон</Label>
    <PhoneInput id="phone-empty" value="" />
  </div>
);
