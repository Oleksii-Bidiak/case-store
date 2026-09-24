"use client";

import { useMemo } from "react";
import {
  MY_PERMISSIONS_QUERY,
  useAuth,
  useGetMyPermissions,
} from "@/entities/session";
import type { PermissionEntryEntity } from "@/shared/api";
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
  const {
    accessToken,
    email,
    userId,
    role,
    isOwner,
    permissions,
    arePermissionsLoading,
  } = useAuth();

  // TASK-725: the Ukrainian labels come from the same endpoint the auth context
  // already reads (same query key, so this is a cache hit, not a second
  // request). The context's `permissions` stays the source of truth for WHAT is
  // held; `entries` only names it — so a label never shows for a key the
  // session does not hold, and a key without a label still shows as the key.
  const { data: permissionsData } = useGetMyPermissions({
    query: { ...MY_PERMISSIONS_QUERY, enabled: accessToken !== null },
  });
  const labelled = useMemo(
    () => labelPermissions(permissions, permissionsData?.data?.entries),
    [permissions, permissionsData?.data?.entries],
  );

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
            {labelled.map(({ key, label }) => (
              <li key={key}>
                <Badge variant="secondary" title={key}>
                  {label}
                </Badge>
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

/**
 * Pair each held key with its label: in the server's catalogue order (which
 * groups rights by zone) for the labelled ones, then any key the server did not
 * label, alphabetically, shown as the key itself.
 */
function labelPermissions(
  held: readonly string[],
  entries: readonly PermissionEntryEntity[] | undefined,
): PermissionEntryEntity[] {
  const heldSet = new Set(held);
  const labelled = (entries ?? []).filter((entry) => heldSet.has(entry.key));
  const labelledKeys = new Set(labelled.map((entry) => entry.key));
  const rest = [...heldSet]
    .filter((key) => !labelledKeys.has(key))
    .sort()
    .map((key) => ({ key, label: key }));
  return [...labelled, ...rest];
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
