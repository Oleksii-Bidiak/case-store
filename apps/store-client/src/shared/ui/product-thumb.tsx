import { cn } from "@/shared/lib/utils";
import { pickProductGradient } from "@/shared/lib";

interface ProductThumbProps {
  /** Product name — seeds the gradient and supplies the initial. */
  name: string;
  /** Sizing / rounding for the outer box (e.g. "size-16 rounded-lg"). */
  className?: string;
  /** Sizing for the initial glyph (default "text-2xl"). */
  initialClassName?: string;
}

/**
 * ProductThumb — a stylish gradient placeholder for a product that has no
 * image. Shows the product's initial over a deterministic gradient so it
 * looks intentional rather than empty. Decorative (aria-hidden); callers
 * supply their own accessible label/text alongside.
 */
export function ProductThumb({
  name,
  className,
  initialClassName = "text-2xl",
}: ProductThumbProps) {
  const gradient = pickProductGradient(name);
  const initial = (name?.[0] ?? "?").toUpperCase();

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex items-center justify-center overflow-hidden bg-gradient-to-br",
        gradient,
        className,
      )}
    >
      <span
        className={cn(
          "font-display font-bold opacity-60 select-none",
          initialClassName,
        )}
      >
        {initial}
      </span>
    </div>
  );
}
