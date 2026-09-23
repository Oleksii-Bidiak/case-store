import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Label,
} from "@store/store-admin";

// Closed triggers only — the listbox opens on interaction. Strings from the
// manual-order form (payment method) and the order status controls.
const noop = () => {};

export const WithValue = () => (
  <div style={{ display: "grid", gap: 6 }}>
    <Label htmlFor="sel-pay">Спосіб оплати</Label>
    <Select defaultValue="ON_DELIVERY" onValueChange={noop}>
      <SelectTrigger id="sel-pay" style={{ width: 256 }}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ON_DELIVERY">Оплата при отриманні</SelectItem>
        <SelectItem value="ONLINE">Картка онлайн</SelectItem>
        <SelectItem value="INSTALLMENTS">Оплата частинами</SelectItem>
      </SelectContent>
    </Select>
  </div>
);

export const Placeholder = () => (
  <Select value="" onValueChange={noop}>
    <SelectTrigger
      style={{ width: 224 }}
      aria-label="Оновити статус замовлення"
    >
      <SelectValue placeholder="Змінити статус…" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="CONFIRMED">Підтверджено</SelectItem>
      <SelectItem value="CANCELLED">Скасовано</SelectItem>
    </SelectContent>
  </Select>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Select defaultValue="20">
      <SelectTrigger size="sm" aria-label="Рядків на сторінці">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="20">20</SelectItem>
        <SelectItem value="50">50</SelectItem>
      </SelectContent>
    </Select>
    <Select defaultValue="20">
      <SelectTrigger aria-label="Рядків на сторінці">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="20">20</SelectItem>
        <SelectItem value="50">50</SelectItem>
      </SelectContent>
    </Select>
  </div>
);

// Disabled while a status mutation is in flight (updatePaymentStatus.isPending).
// No invalid cell: no admin Select passes aria-invalid, and the global
// `* { border-color }` in globals.css would hide it anyway (see learnings/A.md).
export const Disabled = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <Select value="" disabled>
      <SelectTrigger style={{ width: 256 }} aria-label="Оновити статус оплати">
        <SelectValue placeholder="Змінити статус оплати…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="PAID">Оплачено</SelectItem>
      </SelectContent>
    </Select>
    <Select defaultValue="ONLINE" disabled>
      <SelectTrigger style={{ width: 256 }} aria-label="Спосіб оплати">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ONLINE">Картка онлайн</SelectItem>
      </SelectContent>
    </Select>
  </div>
);
