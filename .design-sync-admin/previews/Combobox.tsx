import { Combobox, Label } from "@store/store-admin";

// Type-to-filter pickers from the product form (TASK-423). The list opens on
// focus/typing, so the card shows the closed input in each state.
const noop = () => {};
const categories = [
  { value: "cases", label: "Чохли" },
  { value: "glass", label: "Захисне скло" },
  { value: "chargers", label: "Зарядні пристрої" },
];

export const Selected = () => (
  <div style={{ display: "grid", gap: 6, width: 360 }}>
    <Label htmlFor="cb-cat">Категорія</Label>
    <Combobox
      id="cb-cat"
      value="Чохли"
      onInputChange={noop}
      onSelect={noop}
      options={categories}
      placeholder="Почніть вводити назву…"
      emptyText="Нічого не знайдено"
    />
  </div>
);

export const Empty = () => (
  <div style={{ display: "grid", gap: 6, width: 360 }}>
    <Label htmlFor="cb-brand">Бренд</Label>
    <Combobox
      id="cb-brand"
      value=""
      onInputChange={noop}
      onSelect={noop}
      options={[]}
      placeholder="Почніть вводити назву…"
      emptyText="Нічого не знайдено"
    />
  </div>
);

export const Invalid = () => (
  <div style={{ display: "grid", gap: 6, width: 360 }}>
    <Label htmlFor="cb-inv">Категорія</Label>
    <Combobox
      id="cb-inv"
      value=""
      onInputChange={noop}
      onSelect={noop}
      options={categories}
      placeholder="Оберіть категорію"
      aria-invalid
      aria-describedby="cb-inv-err"
    />
    <p id="cb-inv-err" role="alert" className="text-sm text-destructive">
      Оберіть категорію
    </p>
  </div>
);

export const Disabled = () => (
  <div style={{ display: "grid", gap: 6, width: 360 }}>
    <Label htmlFor="cb-dis">Група</Label>
    <Combobox
      id="cb-dis"
      value="Без групи"
      onInputChange={noop}
      onSelect={noop}
      options={[]}
      disabled
    />
  </div>
);
