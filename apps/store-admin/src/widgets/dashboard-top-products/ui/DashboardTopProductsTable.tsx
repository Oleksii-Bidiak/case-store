import Link from "next/link";
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
  /**
   * Whether the caller was sent money (TASK-684) — `summary.revenue !== undefined`
   * at the call site. Explicit because an empty list cannot say it by itself:
   * an owner with no paid sales yet must still see the revenue heading. When
   * omitted it is read off the rows.
   */
  showsRevenue?: boolean;
}

/**
 * Top-products-by-revenue table. Pure presentational — receives the
 * already-fetched, revenue-ranked list (PAID orders only; see the dashboard
 * repository, TASK-152). Renders an empty-state row when there are no paid
 * sales yet.
 *
 * ── TASK-430: the names are links now ───────────────────────────────────────
 * They were plain text, which made this widget a dead end: the owner reads "this
 * case earned 12 400 ₴", wants to know what it costs and how many are left, and had
 * to go to /products and search for it by name.
 *
 * They link to `/products/[id]` — the READ-ONLY card (TASK-427) — and not to
 * `/products/[id]/edit`. Clicking a number on a dashboard is a question, not an
 * intent to change anything, and an edit form reached by accident is a form that
 * can be saved by accident. `TopProductDto` carries `productId` and no slug, which
 * is also why the id-keyed card is the right target: the customer-facing preview at
 * `/products/preview/[slug]` is not reachable from here without a second lookup.
 *
 * Still no `"use client"`: `next/link` renders fine in a server component, and this
 * widget has no state to own.
 *
 * ── TASK-684: money only when the API sent money ────────────────────────────
 * For a caller without `analytics:revenue` the API strips `totalRevenue` from
 * every row and ranks the list by units sold instead. The table follows the
 * data: when no row carries a sum it shows units, under a heading that no longer
 * says «за виручкою». It never renders a blank or «0 ₴» money column — that would
 * misreport the shop — and it cannot reveal a sum the response did not contain.
 */
export function DashboardTopProductsTable({
  products,
  showsRevenue,
}: DashboardTopProductsTableProps) {
  // Either every row carries a sum or none does — the API decides per caller.
  const showsMoney =
    showsRevenue ??
    products.some((product) => product.totalRevenue !== undefined);

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
        {showsMoney
          ? dict.dashboard.topProducts
          : dict.dashboard.topProductsByUnits}
      </h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead hideOnMobile className="w-12">
              {dict.dashboard.rank}
            </TableHead>
            <TableHead>{dict.dashboard.product}</TableHead>
            <TableHead className="text-right">
              {showsMoney
                ? dict.dashboard.totalRevenue
                : dict.dashboard.unitsSold}
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
                <TableCell hideOnMobile className="text-muted-foreground">
                  {index + 1}
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={`/products/${product.productId}`}
                    aria-label={dict.dashboard.topProductLinkAria(product.name)}
                    className="hover:underline"
                  >
                    {product.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {showsMoney && product.totalRevenue !== undefined
                    ? formatCurrency(product.totalRevenue)
                    : product.unitsSold}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
