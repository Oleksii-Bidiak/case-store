import { ProductCard, Button } from "@store/store-client";

// Realistic PublicProductEntity shapes. ProductCard is presentational; with
// no primaryImage it renders the branded gradient placeholder. createdAt is
// "now" so the recency "New" badge shows on the non-sale card.
const onSale = {
  id: "1",
  slug: "braided-usb-c-cable",
  name: "Braided USB-C Cable 2m — Fast Charge",
  price: "299",
  compareAtPrice: "399",
  primaryImage: null,
  ratingAverage: 4.6,
  ratingCount: 213,
  createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
};

const newArrival = {
  id: "2",
  slug: "magsafe-wireless-charger",
  name: "MagSafe Wireless Charger 15W",
  price: "899",
  compareAtPrice: null,
  primaryImage: null,
  ratingAverage: 4.2,
  ratingCount: 41,
  createdAt: new Date().toISOString(),
};

export const OnSale = () => (
  <div style={{ width: 260 }}>
    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
    <ProductCard product={onSale as any} />
  </div>
);

export const NewArrival = () => (
  <div style={{ width: 260 }}>
    <ProductCard product={newArrival as any} />
  </div>
);

export const WithAddToCart = () => (
  <div style={{ width: 260 }}>
    <ProductCard
      product={onSale as any}
      action={
        <Button size="sm" style={{ width: "100%" }}>
          Add to cart
        </Button>
      }
    />
  </div>
);
