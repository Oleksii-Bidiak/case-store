import { Switch, Label } from "@store/store-admin";

export const States = () => (
  <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
    <Switch aria-label="Вимкнено" />
    <Switch defaultChecked aria-label="Увімкнено" />
    <Switch disabled aria-label="Недоступно" />
    <Switch disabled defaultChecked aria-label="Недоступно, увімкнено" />
  </div>
);

// Blog post form (TASK-436): switch + label + a hint that names the consequence.
export const WithLabelAndHint = () => (
  <div style={{ display: "grid", gap: 16, width: 460 }}>
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <Switch id="sw-featured" defaultChecked />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Label htmlFor="sw-featured">Головна стаття тижня</Label>
        <p className="text-sm text-muted-foreground">
          Стаття показується великим блоком угорі сторінки «Блог». Такою може
          бути лише одна — увімкнувши тут, зніміть у попередньої.
        </p>
      </div>
    </div>
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <Switch id="sw-listed" />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Label htmlFor="sw-listed">Показувати у списках</Label>
        <p className="text-sm text-muted-foreground">
          Вимкніть, щоб прибрати статтю зі списку блогу, з підказок пошуку і з
          блоку «Читайте також».
        </p>
      </div>
    </div>
  </div>
);
