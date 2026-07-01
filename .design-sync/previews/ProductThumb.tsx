import { ProductThumb } from "@store/store-client";

export const Sizes = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
    <ProductThumb name="AirPods Pro" className="size-12 rounded-lg" initialClassName="text-lg" />
    <ProductThumb name="Belkin Charger" className="size-16 rounded-xl" />
    <ProductThumb name="Spigen Case" className="size-24 rounded-2xl" initialClassName="text-4xl" />
  </div>
);
