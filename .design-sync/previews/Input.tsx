import { Input, Label } from "@store/store-client";

export const Default = () => (
  <div style={{ maxWidth: 300 }}>
    <Input placeholder="Пошук товарів…" />
  </div>
);

export const WithLabel = () => (
  <div style={{ display: "grid", gap: 6, maxWidth: 300 }}>
    <Label htmlFor="email">Електронна пошта</Label>
    <Input id="email" type="email" placeholder="you@example.com" />
  </div>
);

export const Disabled = () => (
  <div style={{ maxWidth: 300 }}>
    <Input disabled defaultValue="oleksii@example.com" />
  </div>
);

export const Invalid = () => (
  <div style={{ display: "grid", gap: 6, maxWidth: 300 }}>
    <Label htmlFor="promo">Промокод</Label>
    <Input id="promo" aria-invalid defaultValue="SUMMER-2024" />
  </div>
);
