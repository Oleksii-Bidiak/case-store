import { Label, Input } from "@store/store-client";

export const WithInput = () => (
  <div style={{ display: "grid", gap: 6, maxWidth: 300 }}>
    <Label htmlFor="full-name">Full name</Label>
    <Input id="full-name" placeholder="Taras Shevchenko" />
  </div>
);

export const Standalone = () => <Label>Shipping address</Label>;
