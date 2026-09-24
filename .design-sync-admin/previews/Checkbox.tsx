import { Checkbox, Label } from "@store/store-admin";

// Tri-state (TASK-353): "indeterminate" draws a dash — "some rows on this
// page are selected" must never look like "all rows".
export const States = () => (
  <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
    <Checkbox aria-label="Не вибрано" />
    <Checkbox defaultChecked aria-label="Вибрано" />
    <Checkbox checked="indeterminate" aria-label="Частково вибрано" />
    <Checkbox disabled aria-label="Недоступно" />
    <Checkbox disabled defaultChecked aria-label="Недоступно, вибрано" />
  </div>
);

export const WithLabel = () => (
  <div style={{ display: "grid", gap: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Checkbox id="cb-active" defaultChecked />
      <Label htmlFor="cb-active">Показувати на сайті</Label>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Checkbox id="cb-featured" />
      <Label htmlFor="cb-featured">Рекомендований товар</Label>
    </div>
  </div>
);
