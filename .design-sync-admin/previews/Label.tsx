import { Label, Input, Checkbox } from "@store/store-admin";

// Labels are always bound via htmlFor; the disabled peer dims the label.
export const WithInput = () => (
  <div style={{ display: "grid", gap: 6, width: 320 }}>
    <Label htmlFor="lb-name">Назва</Label>
    <Input id="lb-name" defaultValue="Захисне скло ESR Armorite для iPhone 15" />
  </div>
);

export const WithCheckbox = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <Checkbox id="lb-active" defaultChecked />
    <Label htmlFor="lb-active">Активний (показувати в магазині)</Label>
  </div>
);

export const DisabledPeer = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <Checkbox id="lb-dis" className="peer" disabled />
    <Label htmlFor="lb-dis">Рекомендований товар</Label>
  </div>
);
