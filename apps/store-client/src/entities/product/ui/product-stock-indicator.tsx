import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

/**
 * ProductStockIndicator — the availability line under a PDP / quick-view price
 * (Product mockup §3.4, TASK-2080): a 10px dot and «В наявності» in `success`,
 * or «Немає в наявності» in `muted-foreground`. Sold out is a fact, not an
 * alarm, so it never takes the destructive colour, and the line promises no
 * delivery date. Driven by the public `inStock` boolean derived server-side;
 * the raw stock quantity is never exposed to customers (TASK-132 / TASK-158).
 */
export function ProductStockIndicator({
  inStock,
  className,
}: {
  inStock: boolean;
  /**
   * Accepted for existing call sites only. The line no longer has a
   * «Закінчується» state: the mockup shows in stock or out, nothing between.
   */
  lowStock?: boolean;
  className?: string;
}) {
  return (
    <p
      data-slot="stock-line"
      data-in-stock={inStock}
      className={cn(
        "flex items-center gap-1.5 text-sm",
        inStock ? "text-success" : "text-muted-foreground",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full bg-current"
      />
      {inStock ? dict.product.inStockLabel : dict.product.outOfStock}
    </p>
  );
}
