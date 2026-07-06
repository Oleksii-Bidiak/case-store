import type { LowStockProductDto } from "@/entities/dashboard";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";

interface DashboardLowStockTableProps {
  products: LowStockProductDto[];
}

/**
 * Low-stock alert table. Pure presentational — receives the already-fetched
 * position list. A red `destructive` badge flags critical stock (<= 2), an
 * amber `warning` badge flags low stock (<= 5) — color carries meaning.
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
            <TableHead className="text-right">{dict.dashboard.stock}</TableHead>
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
                  {product.stock <= 2 ? (
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
