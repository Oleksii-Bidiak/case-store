import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";

export default function DashboardPage() {
  return (
    <div>
      <section>
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-foreground">
            Welcome to the Admin Panel
          </h2>
          <Badge variant="secondary">MVP</Badge>
        </div>
        <p className="mt-2 text-muted-foreground">
          Manage products, orders, and users for the Mobile Accessories Store.
        </p>
      </section>

      <Separator className="my-6" />

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="text-sm font-medium text-muted-foreground">
            Total Products
          </h3>
          <p className="mt-2 text-3xl font-bold text-foreground">—</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Product catalog items
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="text-sm font-medium text-muted-foreground">
            Total Orders
          </h3>
          <p className="mt-2 text-3xl font-bold text-foreground">—</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pending &amp; completed
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="text-sm font-medium text-muted-foreground">
            Total Revenue
          </h3>
          <p className="mt-2 text-3xl font-bold text-foreground">—</p>
          <p className="mt-1 text-xs text-muted-foreground">This month</p>
        </div>
      </section>

      <Separator className="my-6" />

      <section>
        <h3 className="text-lg font-semibold text-foreground">Quick Actions</h3>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button>Add Product</Button>
          <Button variant="outline">View Orders</Button>
          <Button variant="outline">Manage Users</Button>
        </div>
      </section>
    </div>
  );
}
