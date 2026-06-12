import type { LowStockVariantDto } from "@/entities/dashboard";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";

interface DashboardLowStockTableProps {
  variants: LowStockVariantDto[];
}

/**
 * Low-stock alert table. Pure presentational — receives the already-fetched
 * variant list. A red badge flags critical stock (<= 2), yellow flags low
 * (<= 5).
 */
export function DashboardLowStockTable({
  variants,
}: DashboardLowStockTableProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
        Low Stock Alerts
      </h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Variant</TableHead>
            <TableHead className="text-right">Stock</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {variants.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={3}
                className="py-6 text-center text-sm text-muted-foreground"
              >
                No low-stock variants.
              </TableCell>
            </TableRow>
          ) : (
            variants.map((variant) => (
              <TableRow key={variant.variantId}>
                <TableCell className="font-medium">
                  {variant.productName}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {variant.variantName}
                </TableCell>
                <TableCell className="text-right">
                  {variant.stock <= 2 ? (
                    <Badge variant="destructive">{variant.stock}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-yellow-600">
                      {variant.stock}
                    </Badge>
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
