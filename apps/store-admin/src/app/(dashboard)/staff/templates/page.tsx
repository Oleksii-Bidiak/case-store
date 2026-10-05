import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  PermissionTemplatesSkeleton,
  PermissionTemplatesView,
} from "@/widgets";
import { PERM } from "@/entities/permission";
import { PermissionGate } from "@/entities/session";
import { dict } from "@/shared/config";

/**
 * «Шаблони прав».
 *
 * A static segment under `/staff`, so Next resolves it ahead of `[id]` — the
 * templates screen is deliberately a sibling of the staff register rather than a
 * tab on it, because a template is about NOBODY in particular and mixing it into
 * a person's card is what made the old `/settings/permissions` screen read as
 * "rights belong to roles".
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.staff.metaTitleTemplates,
};

export default function PermissionTemplatesPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Silent, like the /staff header buttons: «← Співробітники» would
          only lead a refused manager to a second refusal. */}
      <PermissionGate permission={PERM.staffRead} fallback={null}>
        <Link
          href="/staff"
          className="w-fit rounded-xs text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {dict.staff.back}
        </Link>
      </PermissionGate>

      {/* TASK-639: one refusal instead of the view's failed queries. */}
      <PermissionGate
        permission={PERM.staffRead}
        title={dict.staff.forbidden}
        hint={dict.staff.forbiddenHint}
      >
        <Suspense fallback={<PermissionTemplatesSkeleton />}>
          <PermissionTemplatesView />
        </Suspense>
      </PermissionGate>
    </div>
  );
}
