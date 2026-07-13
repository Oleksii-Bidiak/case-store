import { Check, AlertTriangle, X } from "lucide-react";
import { dict } from "@/shared/config";

/**
 * ProductStockIndicator — colour-coded availability line for the position.
 * Driven by the public booleans (`inStock`/`lowStock`) derived server-side; the
 * raw stock quantity is never exposed to customers (TASK-132 / TASK-158).
 */
export function ProductStockIndicator({
  inStock,
  lowStock,
}: {
  inStock: boolean;
  lowStock: boolean;
}) {
  if (!inStock) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
        <X className="size-4" aria-hidden="true" />
        {dict.product.outOfStock}
      </p>
    );
  }

  if (lowStock) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
        <AlertTriangle className="size-4" aria-hidden="true" />
        {dict.product.lowStock}
      </p>
    );
  }

  return (
    <p className="flex items-center gap-1.5 text-sm font-medium text-success">
      <Check className="size-4" aria-hidden="true" />
      {dict.product.inStockLabel}
    </p>
  );
}
