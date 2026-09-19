import { ProductCardImage } from "@store/store-client";

// The image box of ProductCard: the parent owns the square frame and the
// gradient behind it; with no `src` the component shows the product initial
// over that gradient (the classes are PRODUCT_GRADIENTS[0] from shared/lib). Photos are letterboxed (object-contain), never cropped.
const frame: React.CSSProperties = {
  position: "relative",
  width: 200,
  aspectRatio: "1 / 1",
  overflow: "hidden",
  borderRadius: 12,
};

export const Placeholder = () => (
  <div className="bg-gradient-to-br from-indigo-100 to-sky-100 text-indigo-300" style={frame}>
    <ProductCardImage alt="Бездротова зарядка MagSafe 15 Вт" initial="Б" />
  </div>
);
