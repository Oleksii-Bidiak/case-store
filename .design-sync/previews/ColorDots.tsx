import { ColorDots } from "@store/store-client";

// Swatch row from a product's variant summary (free-form colour values are
// mapped to real colours by the store's swatch vocabulary, UA or EN).
const colors = (values: string[]) =>
  values.map((value, i) => ({
    value,
    productId: `p${i}`,
    slug: `chohol-${i}`,
    inStock: true,
  }));

export const FourColors = () => (
  <ColorDots colors={colors(["Чорний", "Темно-синій", "Білий", "Червоний"])} />
);

export const WithOverflow = () => (
  <ColorDots
    colors={colors([
      "Чорний",
      "Space Gray",
      "Срібний",
      "Золотий",
      "Рожевий",
      "Зелений",
      "Фіолетовий",
    ])}
  />
);
