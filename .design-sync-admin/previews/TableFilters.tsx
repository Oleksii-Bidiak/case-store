import { TableFilters } from "@store/store-admin";

// The three filters widgets/product-list declares (dictionary.ts → products.*).
const productFilters = [
  {
    param: "status",
    label: "Фільтр за статусом",
    allLabel: "Усі статуси",
    options: [
      { value: "active", label: "Лише активні" },
      { value: "hidden", label: "Лише приховані" },
    ],
  },
  {
    param: "stock",
    label: "Фільтр за залишком",
    allLabel: "Будь-який залишок",
    options: [{ value: "out", label: "Немає в наявності" }],
  },
  {
    param: "deleted",
    label: "Видалені",
    allLabel: "Без видалених",
    options: [{ value: "only", label: "Лише видалені" }],
  },
];

// Nothing filtered: every trigger shows its «all» option, no chips.
export const NoneActive = () => (
  <div style={{ width: 640 }}>
    <TableFilters filters={productFilters} values={{}} />
  </div>
);

// One filter on → one removable chip «Label: value».
export const OneActive = () => (
  <div style={{ width: 640 }}>
    <TableFilters filters={productFilters} values={{ status: "hidden" }} />
  </div>
);

// Two or more on → a chip each plus «Скинути фільтри».
export const SeveralActive = () => (
  <div style={{ width: 640 }}>
    <TableFilters
      filters={productFilters}
      values={{ status: "active", stock: "out" }}
    />
  </div>
);

// While a query is in flight the list disables its controls.
export const Disabled = () => (
  <div style={{ width: 640 }}>
    <TableFilters
      filters={productFilters}
      values={{ stock: "out" }}
      disabled
    />
  </div>
);
