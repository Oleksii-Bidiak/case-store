import { TableSearch } from "@store/store-admin";

// Every admin list puts this box in TableToolbar's `search` slot. The
// placeholder/label pairs are the real ones from dictionary.ts
// (products.searchPlaceholder / products.searchAria, orders, reorderList).
export const Default = () => (
  <div style={{ width: 360 }}>
    <TableSearch
      value=""
      placeholder="Пошук товарів…"
      label="Пошук товарів"
    />
  </div>
);

// A committed needle — the box is seeded from `?search=` in the URL.
export const WithQuery = () => (
  <div style={{ width: 360 }}>
    <TableSearch
      value="spigen iphone 15"
      placeholder="Пошук товарів…"
      label="Пошук товарів"
    />
  </div>
);

// Orders queue: a long, descriptive placeholder; the box is capped at max-w-xs.
export const LongPlaceholder = () => (
  <div style={{ width: 360 }}>
    <TableSearch
      value=""
      placeholder="Номер замовлення, пошта або телефон…"
      label="Пошук замовлень"
    />
  </div>
);

export const Disabled = () => (
  <div style={{ width: 360 }}>
    <TableSearch
      mode="local"
      value=""
      placeholder="Пошук за текстом запитання…"
      label="Пошук запитань"
      disabled
    />
  </div>
);
