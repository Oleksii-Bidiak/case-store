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
import { CardHeaderLink } from "@/shared/ui/card-header-link";
import { dict } from "@/shared/config";

interface DashboardLowStockTableProps {
  products: LowStockProductDto[];
  /**
   * Show «Усі з низьким залишком →» (TASK-1037). The caller passes it only for
   * a session that may open the product list (`products:read`).
   */
  showAllLink?: boolean;
}

/**
 * Where «Усі з низьким залишком →» leads. The product list has no low-stock
 * FILTER (a `lowStock` param is the API tail of TASK-1041), but it filters to
 * active products and sorts by the same `stock` this widget reads — and the
 * widget's own query is `isActive && stock <= 5 ORDER BY stock`. So the list
 * opens with exactly these rows on top, followed by the rest in stock order: no
 * «3 here, 27 there» mismatch (TASK-607).
 */
export const LOW_STOCK_LIST_HREF =
  "/products?status=active&sortBy=stock&sortOrder=asc";

/**
 * Low-stock alert table. Pure presentational — receives the already-fetched
 * position list. A red `destructive` badge flags critical stock (<= 2), an
 * amber `warning` badge flags low stock (<= 5) — color carries meaning. A
 * sold-out position (`stock === 0`) shows a «Розпродано» badge instead of the
 * numeric `0` (TASK-253) — the highest-priority restock signal, sorted first.
 */
export function DashboardLowStockTable({
  products,
  showAllLink = false,
}: DashboardLowStockTableProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium text-muted-foreground">
          {dict.dashboard.lowStock}
        </h3>
        {showAllLink ? (
          <CardHeaderLink href={LOW_STOCK_LIST_HREF}>
            {dict.dashboard.allLowStockLink}
          </CardHeaderLink>
        ) : null}
      </div>
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
