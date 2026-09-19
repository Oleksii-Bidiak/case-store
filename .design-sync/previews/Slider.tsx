import { Slider } from "@store/store-client";

// Two-thumb price range from the catalogue filters. The row of amounts under
// it is the filter's own markup (the Slider itself renders only the track).
export const PriceRange = () => (
  <div style={{ width: 300 }}>
    <Slider
      defaultValue={[300, 1500]}
      min={0}
      max={3000}
      step={50}
      minStepsBetweenThumbs={1}
      thumbLabels={["Мінімальна ціна", "Максимальна ціна"]}
      aria-label="Діапазон цін"
    />
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: 10,
        fontSize: 12,
        fontFamily: "var(--font-mono)",
        color: "var(--color-muted-foreground)",
      }}
    >
      <span>300 ₴</span>
      <span>1 500 ₴</span>
    </div>
  </div>
);

export const Disabled = () => (
  <div style={{ width: 300 }}>
    <Slider defaultValue={[0, 3000]} min={0} max={3000} disabled />
  </div>
);
