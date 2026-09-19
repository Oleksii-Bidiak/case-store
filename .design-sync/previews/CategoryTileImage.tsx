import { CategoryTileImage } from "@store/store-client";

// Category tile from the /categories grid. With no image (or a broken or
// foreign URL) the tile renders the `fallback` — the storefront passes a
// gradient with the category icon. The caption beside it names the category,
// so the image itself is decorative (`alt=""`).
const tile: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: 196,
  padding: 18,
  borderRadius: 16,
  border: "1px solid var(--color-border)",
  background: "var(--color-card)",
  boxShadow: "var(--shadow-card)",
};

// Same formula as the storefront's categoryGradient(index): token-free oklch
// hues that follow the theme, never raw hex.
const gradient = (hue: number) =>
  `linear-gradient(140deg, oklch(0.7 0.16 ${hue}), oklch(0.55 0.19 ${hue}))`;

const fallback = (letter: string, hue: number) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      background: gradient(hue),
      color: "white",
      fontFamily: "var(--font-display)",
      fontSize: 40,
      fontWeight: 700,
    }}
  >
    {letter}
  </div>
);

const Tile = ({ name, letter, hue }: { name: string; letter: string; hue: number }) => (
  <div style={tile}>
    <div
      style={{
        position: "relative",
        aspectRatio: "1 / 1",
        marginBottom: 14,
        overflow: "hidden",
        borderRadius: 13,
      }}
    >
      <CategoryTileImage
        src={null}
        alt=""
        className="size-full object-cover"
        fallback={fallback(letter, hue)}
      />
    </div>
    <b style={{ fontSize: 15, fontWeight: 600 }}>{name}</b>
  </div>
);

export const Fallback = () => (
  <div style={{ display: "flex", gap: 16 }}>
    <Tile name="Чохли" letter="Ч" hue={265} />
    <Tile name="Зарядні пристрої" letter="З" hue={200} />
  </div>
);
