import { ProductThumb } from "@store/store-client";

// Gradient + initial placeholder for image-less products (cart rows, order
// lines, search suggestions).
export const Sizes = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
    <ProductThumb name="AirPods Pro" className="size-12 rounded-lg" initialClassName="text-lg" />
    <ProductThumb name="Зарядка Belkin" className="size-16 rounded-xl" />
    <ProductThumb name="Чохол Spigen" className="size-24 rounded-2xl" initialClassName="text-4xl" />
  </div>
);
