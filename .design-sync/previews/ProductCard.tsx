import { ProductCard, Button } from "@store/store-client";

// Realistic PublicProductEntity shapes (cast: the preview only fills the fields
// the card reads). ProductCard is presentational; with no primaryImage it
// renders the branded gradient placeholder. `inStock` MUST be set — the card
// dims and labels anything else «Немає в наявності» (TASK-362).
const day = 24 * 60 * 60 * 1000;
const colors = (values: string[]) =>
  values.map((value, i) => ({
    value,
    productId: `c${i}`,
    slug: `chohol-iphone-15-pro-${i}`,
    inStock: true,
  }));

const onSale = {
  id: "1",
  slug: "kabel-usb-c-2m-60w",
  name: "Кабель USB-C → USB-C 2 м, 60 Вт, нейлонове обплетення",
  price: "299",
  compareAtPrice: "399",
  primaryImage: null,
  inStock: true,
  ratingAverage: 4.6,
  ratingCount: 213,
  createdAt: new Date(Date.now() - 120 * day).toISOString(),
};

const newArrival = {
  id: "2",
  slug: "zaryadka-magsafe-15w",
  name: "Бездротова зарядка MagSafe 15 Вт",
  price: "899",
  compareAtPrice: null,
  primaryImage: null,
  inStock: true,
  ratingAverage: 4.2,
  ratingCount: 41,
  createdAt: new Date().toISOString(),
};

const withColors = {
  id: "3",
  slug: "chohol-iphone-15-pro",
  name: "Силіконовий чохол для iPhone 15 Pro з MagSafe",
  price: "549",
  compareAtPrice: null,
  primaryImage: null,
  inStock: true,
  ratingAverage: 4.8,
  ratingCount: 96,
  createdAt: new Date(Date.now() - 90 * day).toISOString(),
  variantSummary: {
    groupId: "g1",
    variantCount: 4,
    priceFrom: "549",
    defaultVariantId: "3",
    defaultVariantSlug: "chohol-iphone-15-pro",
    defaultInStock: true,
    colors: colors(["Чорний", "Темно-синій", "Білий", "Червоний"]),
  },
};

const soldOut = {
  id: "4",
  slug: "zahysne-sklo-iphone-15",
  name: "Захисне скло 3D для iPhone 15",
  price: "249",
  compareAtPrice: null,
  primaryImage: null,
  inStock: false,
  ratingAverage: 4.4,
  ratingCount: 58,
  createdAt: new Date(Date.now() - 200 * day).toISOString(),
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export const NewArrival = () => (
  <div style={{ width: 260 }}>
    <ProductCard product={newArrival as any} />
  </div>
);

export const OnSale = () => (
  <div style={{ width: 260 }}>
    <ProductCard product={onSale as any} />
  </div>
);

export const WithColors = () => (
  <div style={{ width: 260 }}>
    <ProductCard product={withColors as any} />
  </div>
);

export const SoldOut = () => (
  <div style={{ width: 260 }}>
    <ProductCard product={soldOut as any} />
  </div>
);

export const WithAddToCart = () => (
  <div style={{ width: 260 }}>
    <ProductCard
      product={onSale as any}
      action={
        <Button size="sm" style={{ width: "100%" }}>
          Додати до кошика
        </Button>
      }
    />
  </div>
);
