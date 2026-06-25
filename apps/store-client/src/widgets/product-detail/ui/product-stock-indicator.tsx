import { Check, AlertTriangle, X } from "lucide-react";
import { dict } from "@/shared/config";

const LOW_STOCK_THRESHOLD = 5;

/**
 * ProductStockIndicator — colour-coded availability line for the position.
 * `stock` is null when unknown (nothing rendered).
 */
export function ProductStockIndicator({ stock }: { stock: number | null }) {
  if (stock == null) {
    return null;
  }

  if (stock <= 0) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
        <X className="size-4" aria-hidden="true" />
        {dict.product.outOfStock}
      </p>
    );
  }

  if (stock < LOW_STOCK_THRESHOLD) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
        <AlertTriangle className="size-4" aria-hidden="true" />
        {dict.product.lowStock(stock)}
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
