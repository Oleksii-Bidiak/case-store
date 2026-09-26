import type { Metadata } from "next";
import { OrderCreateView } from "@/widgets";
import { PERM } from "@/entities/permission";
import { PermissionGate } from "@/entities/session";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.orders.createMetaTitle,
};

export default function NewOrderPage() {
  // TASK-715: `POST /admin/orders` needs `orders:write`. Without it the form
  // would be filled in only to be refused on «Створити», so a session that
  // typed the URL gets one refusal instead of the form.
  return (
    <PermissionGate
      permission={PERM.ordersWrite}
      title={dict.orders.createForbidden}
      hint={dict.orders.createForbiddenHint}
    >
      <OrderCreateView />
    </PermissionGate>
  );
}
