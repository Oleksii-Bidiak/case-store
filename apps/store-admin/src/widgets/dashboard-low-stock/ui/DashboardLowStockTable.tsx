import { Info } from "lucide-react";
import type { LowStockProductDto } from "@/entities/dashboard";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui";
import { dict } from "@/shared/config";

interface DashboardLowStockTableProps {
  products: LowStockProductDto[];
}

/**
 * Low-stock alert table. Pure presentational — receives the already-fetched
 * position list. A red `destructive` badge flags critical stock (<= 2), an
 * amber `warning` badge flags low stock (<= 5) — color carries meaning. A
 * sold-out position (`stock === 0`) shows a «Розпродано» badge instead of the
 * numeric `0` (TASK-253) — the highest-priority restock signal, sorted first.
 */
export function DashboardLowStockTable({
  products,
}: DashboardLowStockTableProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
        {dict.dashboard.lowStock}
      </h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{dict.dashboard.product}</TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center justify-end gap-1.5">
                {dict.dashboard.stock}
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    aria-label={dict.dashboard.metricInfoAria(
                      dict.dashboard.stock,
                    )}
                    className="inline-flex rounded-sm text-muted-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                  >
                    <Info className="size-3.5" aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipContent>{dict.dashboard.stockHint}</TooltipContent>
                </Tooltip>
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={2}
                className="py-6 text-center text-sm text-muted-foreground"
              >
                {dict.dashboard.noLowStock}
              </TableCell>
            </TableRow>
          ) : (
            products.map((product) => (
              <TableRow key={product.productId}>
                <TableCell className="font-medium">
                  {product.productName}
                </TableCell>
                <TableCell className="text-right">
                  {product.stock === 0 ? (
                    <Badge variant="destructive">
                      {dict.dashboard.soldOut}
                    </Badge>
                  ) : product.stock <= 2 ? (
                    <Badge variant="destructive">{product.stock}</Badge>
                  ) : (
                    <Badge variant="warning">{product.stock}</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
