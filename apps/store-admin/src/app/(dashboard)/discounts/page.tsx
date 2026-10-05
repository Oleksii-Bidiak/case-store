import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { PlusIcon } from "lucide-react";
import { AdminDiscountTable, AdminDiscountTableSkeleton } from "@/widgets";
import { PERM } from "@/entities/permission";
import { PermissionGate } from "@/entities/session";
import { Button, RegistryHeader } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * TASK-405: this table keeps its view state (`?isActive=`, `?page=`,
 * `?search=`, sort) in the query string. A statically prerendered route serves
 * one and the same prerender for every query string, so a hard load of a
 * filtered URL followed by a query-only `router.replace` re-renders nothing and
 * the controls go dead. Rendering on request makes each of those a real
 * navigation. Every admin route sits behind auth, so there is no static payload
 * worth keeping.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.discounts.metaTitle,
};

/**
 * «Промокоди» (wave 198, DiscountsProposal ПК1): the heading with the
 * owner-confirmed hint that only a signed-in customer can apply a code, the
 * one primary action — gated by `discounts:write`, the key `POST
 * /admin/discounts` requires — then the register.
 */
export default function DiscountsPage() {
  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader
        title={dict.discounts.heading}
        description={dict.discounts.description}
        actions={
          <PermissionGate permission={PERM.discountsWrite} fallback={null}>
            <Button asChild>
              <Link href="/discounts/new">
                <PlusIcon aria-hidden="true" />
                {dict.discounts.add}
              </Link>
            </Button>
          </PermissionGate>
        }
      />

      <Suspense fallback={<AdminDiscountTableSkeleton />}>
        <AdminDiscountTable />
      </Suspense>
    </div>
  );
}
