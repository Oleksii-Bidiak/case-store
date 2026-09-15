import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  PermissionTemplatesSkeleton,
  PermissionTemplatesView,
} from "@/widgets";
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
      <Link
        href="/staff"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        {dict.staff.back}
      </Link>

      <Suspense fallback={<PermissionTemplatesSkeleton />}>
        <PermissionTemplatesView />
      </Suspense>
    </div>
  );
}
