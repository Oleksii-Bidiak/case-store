import { PhoneInput, Label } from "@store/store-client";

export const Filled = () => (
  <div style={{ display: "grid", gap: 6, maxWidth: 300 }}>
    <Label htmlFor="phone">Phone</Label>
    {/* Controlled UA mask: "501234567" renders as "+380 50 123 4567". */}
    <PhoneInput id="phone" value="501234567" />
  </div>
);

export const Empty = () => (
  <div style={{ maxWidth: 300 }}>
    <PhoneInput value="" />
  </div>
);
