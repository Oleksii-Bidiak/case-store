import { Textarea, Label } from "@store/store-client";

export const Default = () => (
  <div style={{ maxWidth: 360 }}>
    <Textarea placeholder="Коментар до замовлення…" rows={4} />
  </div>
);

export const WithLabel = () => (
  <div style={{ display: "grid", gap: 6, maxWidth: 360 }}>
    <Label htmlFor="msg">Коментар до замовлення</Label>
    <Textarea id="msg" rows={4} defaultValue="Зателефонуйте, будь ласка, перед відправкою." />
  </div>
);

export const Disabled = () => (
  <div style={{ maxWidth: 360 }}>
    <Textarea disabled rows={3} defaultValue="Замовлення вже відправлено — коментар не редагується." />
  </div>
);
