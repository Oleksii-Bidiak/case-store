import { Input, Label } from "@store/store-client";

export const Default = () => (
  <div style={{ maxWidth: 300 }}>
    <Input placeholder="Search accessories…" />
  </div>
);

export const WithLabel = () => (
  <div style={{ display: "grid", gap: 6, maxWidth: 300 }}>
    <Label htmlFor="email">Email</Label>
    <Input id="email" type="email" placeholder="you@example.com" />
  </div>
);

export const Disabled = () => (
  <div style={{ maxWidth: 300 }}>
    <Input disabled placeholder="Unavailable" />
  </div>
);

export const Invalid = () => (
  <div style={{ display: "grid", gap: 6, maxWidth: 300 }}>
    <Label htmlFor="qty">Quantity</Label>
    <Input id="qty" aria-invalid defaultValue="-1" />
  </div>
);
