import { Label, Input } from "@store/store-client";

export const WithInput = () => (
  <div style={{ display: "grid", gap: 6, maxWidth: 300 }}>
    <Label htmlFor="full-name">Ім'я та прізвище</Label>
    <Input id="full-name" placeholder="Тарас Шевченко" />
  </div>
);

export const Standalone = () => <Label>Адреса доставки</Label>;
