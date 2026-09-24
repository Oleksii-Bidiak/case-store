import { Badge } from "@store/store-admin";

// Every colour variant as it appears in the admin lists. Order status maps via
// entities/order/status-badge.ts: DELIVERED → success, PENDING → warning,
// CONFIRMED/SHIPPED → default, CANCELLED/REFUNDED → destructive.
export const Variants = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <Badge>Активний</Badge>
    <Badge variant="secondary">Неактивний</Badge>
    <Badge variant="success">Доставлено</Badge>
    <Badge variant="warning">Очікує оплати</Badge>
    <Badge variant="destructive">Скасовано</Badge>
    <Badge variant="sale">Знижка</Badge>
    <Badge variant="outline">Чохли</Badge>
  </div>
);

// Publishing status in banner / blog tables (TASK-430): a scheduled item
// carries its date in amber so it never reads like a grey draft.
export const PublishStatus = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <Badge>Опубліковано</Badge>
    <Badge variant="secondary">Чернетка</Badge>
    <Badge variant="warning">Заплановано на 01.10.2026</Badge>
  </div>
);

// Low-stock widget on the dashboard: 0 = sold out, low counts in amber/red.
export const StockCounts = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <Badge variant="destructive">Розпродано</Badge>
    <Badge variant="destructive">2</Badge>
    <Badge variant="warning">5</Badge>
    <Badge variant="success">Пошту підтверджено</Badge>
  </div>
);

// Sidebar counters next to nav items (new orders, pending reviews).
export const NavCounter = () => (
  <div style={{ display: "grid", gap: 8, width: 240 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
      <span>Замовлення</span>
      <Badge className="ml-auto" aria-label="Нових замовлень: 3">
        3
      </Badge>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
      <span>Відгуки</span>
      <Badge variant="secondary" className="ml-auto" aria-label="Відгуків на модерації: 12">
        12
      </Badge>
    </div>
  </div>
);
