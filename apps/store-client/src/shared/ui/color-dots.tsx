import type { ProductVariantColorEntity } from "@/shared/api/generated/models";
import { colorSwatch } from "@/shared/lib";
import { dict } from "@/shared/config";

/**
 * ColorDots — "dumb" swatch row for a product's available variant colours.
 *
 * Renders up to `max` colour dots from the list-card variant summary, plus a
 * "+N" overflow chip. Each dot's colour is resolved from the free-form colour
 * value via `colorSwatch` (palette lives in shared/lib, not as raw hex here).
 *
 * a11y: the row carries a single descriptive `aria-label` listing every colour
 * (including overflow), and the individual dots are `aria-hidden` so a screen
 * reader announces the colours once rather than per swatch.
 */
export function ColorDots({
  colors,
  max = 5,
  className = "",
}: {
  colors: ProductVariantColorEntity[];
  max?: number;
  className?: string;
}) {
  // A single colour is not a meaningful variant choice — render nothing.
  if (colors.length < 2) {
    return null;
  }

  const shown = colors.slice(0, max);
  const overflow = colors.length - shown.length;

  return (
    <div
      className={`flex items-center gap-1.5 ${className}`}
      role="img"
      aria-label={dict.productCard.colorsAvailable(colors.map((c) => c.value))}
    >
      {shown.map((color) => {
        const swatch = colorSwatch(color.value);
        return (
          <span
            key={`${color.value}-${color.productId}`}
            aria-hidden="true"
            title={color.value}
            style={{ backgroundColor: swatch.css }}
            className={`size-3.5 rounded-full ring-1 ring-inset ${
              swatch.isLight ? "ring-border" : "ring-black/10"
            } ${color.inStock ? "" : "opacity-40"}`}
          />
        );
      })}
      {overflow > 0 && (
        <span
          aria-hidden="true"
          className="text-xs font-medium text-muted-foreground"
        >
          {dict.productCard.moreColors(overflow)}
        </span>
      )}
    </div>
  );
}
