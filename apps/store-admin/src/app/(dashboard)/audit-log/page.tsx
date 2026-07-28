import type { Metadata } from "next";
import { AuditLogView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.auditLog.metaTitle,
};

export default function AuditLogPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.auditLog.heading}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {dict.auditLog.intro}
        </p>
      </div>

      <AuditLogView />
    </div>
  );
}
