import { Input, Label } from "@store/store-admin";

// Product form fields (dict.productForm). Label above, gap 6px, as in
// features/product-form.
export const WithLabel = () => (
  <div style={{ display: "grid", gap: 6, width: 360 }}>
    <Label htmlFor="in-name">Назва</Label>
    <Input id="in-name" defaultValue="Чохол Spigen Ultra Hybrid для iPhone 15 Pro" />
  </div>
);

export const Placeholder = () => (
  <div style={{ display: "grid", gap: 6, width: 360 }}>
    <Label htmlFor="in-slug">Slug</Label>
    <Input id="in-slug" placeholder="Залиште порожнім для авто-генерації з назви" />
  </div>
);

export const Invalid = () => (
  <div style={{ display: "grid", gap: 6, width: 360 }}>
    <Label htmlFor="in-price">Ціна</Label>
    <Input id="in-price" defaultValue="0" aria-invalid aria-describedby="in-price-err" />
    <p id="in-price-err" role="alert" className="text-sm text-destructive">
      Ціна має бути більшою за 0
    </p>
  </div>
);

export const Disabled = () => (
  <div style={{ display: "grid", gap: 6, width: 360 }}>
    <Label htmlFor="in-sku">Артикул</Label>
    <Input id="in-sku" defaultValue="SPG-UH-15P" disabled />
  </div>
);
