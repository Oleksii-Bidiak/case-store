import type { TopProductDto } from "@/entities/dashboard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { formatCurrency } from "@/shared/lib";
import { dict } from "@/shared/config";

interface DashboardTopProductsTableProps {
  products: TopProductDto[];
}

/**
 * Top-products-by-revenue table. Pure presentational — receives the
 * already-fetched, revenue-ranked list (PAID orders only; see the dashboard
 * repository, TASK-152). Renders an empty-state row when there are no paid
 * sales yet.
 */
export function DashboardTopProductsTable({
  products,
}: DashboardTopProductsTableProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
        {dict.dashboard.topProducts}
      </h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">{dict.dashboard.rank}</TableHead>
            <TableHead>{dict.dashboard.product}</TableHead>
            <TableHead className="text-right">
              {dict.dashboard.totalRevenue}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={3}
                className="py-6 text-center text-sm text-muted-foreground"
              >
                {dict.dashboard.noTopProducts}
              </TableCell>
            </TableRow>
          ) : (
            products.map((product, index) => (
              <TableRow key={product.productId}>
                <TableCell className="text-muted-foreground">
                  {index + 1}
                </TableCell>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(product.totalRevenue)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
