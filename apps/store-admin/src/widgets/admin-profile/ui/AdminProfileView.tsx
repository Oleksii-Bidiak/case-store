"use client";

import { useAuth } from "@/entities/session";
import { roleLabel } from "@/entities/user";
import { AdminPasswordChangeForm } from "@/features/admin-password-change";
import { Badge, Separator } from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.profile;

/**
 * The signed-in staff member's own profile (TASK-317).
 *
 * Reachable by anyone who can enter the panel — a manager needs to change their
 * own password just as much as the owner does, and this is the only screen in
 * the admin app that is deliberately ungated.
 *
 * The permission list is shown because "why can't I see Замовлення?" is the
 * first question a newly hired manager asks, and the honest answer is a list
 * they can read out to the owner. It comes from `/auth/me/permissions` — the
 * same server-resolved answer the nav filter uses, so the screen cannot claim a
 * permission the API would refuse.
 */
export function AdminProfileView() {
  const { email, userId, role, isOwner, permissions, arePermissionsLoading } =
    useAuth();

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-md border border-border p-4 shadow-card">
        <h3 className="text-sm font-semibold text-foreground">
          {d.accountSection}
        </h3>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={d.fieldEmail} value={email ?? "—"} />
          <Field label={d.fieldRole} value={role ? roleLabel(role) : "—"} />
          <Field label={d.fieldUserId} value={userId ?? "—"} mono />
        </dl>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-border p-4 shadow-card">
        <h3 className="text-sm font-semibold text-foreground">
          {d.permissionsSection}
        </h3>
        {isOwner ? (
          <p className="text-sm text-muted-foreground">{d.permissionsOwner}</p>
        ) : arePermissionsLoading ? (
          <p className="text-sm text-muted-foreground">
            {d.permissionsLoading}
          </p>
        ) : permissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{d.permissionsEmpty}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {[...permissions].sort().map((permission) => (
              <li key={permission}>
                <Badge variant="secondary">{permission}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-border p-4 shadow-card">
        <h3 className="text-sm font-semibold text-foreground">
          {d.passwordSection}
        </h3>
        <Separator />
        <AdminPasswordChangeForm />
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`text-sm text-foreground${mono ? " break-all font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
