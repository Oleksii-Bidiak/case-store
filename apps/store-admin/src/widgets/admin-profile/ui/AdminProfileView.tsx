"use client";

import { useMemo, type ReactNode } from "react";
import {
  MY_PERMISSIONS_QUERY,
  useAuth,
  useGetMyPermissions,
} from "@/entities/session";
import { PERM } from "@/entities/permission";
import {
  ACCESS_LEVEL,
  actorLevel,
  groupByZone,
  levelBadgeVariant,
  levelLabel,
  useGrantableCatalogue,
} from "@/entities/staff";
import {
  useUserControllerGetProfile,
  type GrantablePermissionEntry,
  type PermissionEntryEntity,
  type PermissionZoneEntry,
} from "@/shared/api";
import { AdminPasswordChangeForm } from "@/features/admin-password-change";
import { Badge, CopyButton } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
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
 *
 * Wave 198 (TASK-1055, ProfileProposal П1–П4): account + rights on the left,
 * the password card (420 px) on the right, one column on a phone. The level
 * reads «Власник магазину» for the owner — the old role line said
 * «Адміністратор», out of step with the header. The ID is one monospace size
 * with «Скопіювати». Rights are grouped by zone WHERE THE ZONES ARE READABLE:
 * they live only in the grantable catalogue (`staff/:id/permissions`, behind
 * `staff:read`), which a manager cannot read — so a manager still gets one flat
 * list until `/auth/me/permissions` carries the zone of each entry (API tail).
 * «Останній вхід» from the artboard is not drawn: no endpoint reports it.
 */
export function AdminProfileView() {
  const {
    accessToken,
    email,
    userId,
    isOwner,
    isAdmin,
    permissions,
    arePermissionsLoading,
    can,
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

  // The zones, for whoever may read the catalogue they live in.
  const { catalogue, zones } = useGrantableCatalogue(userId, {
    enabled: !isOwner && can(PERM.staffRead),
  });
  const zoned = useMemo(
    () => groupHeldByZone(labelled, catalogue, zones),
    [labelled, catalogue, zones],
  );

  // The name lives on the profile, not in the token or the permissions answer.
  const { data: profileData } = useUserControllerGetProfile({
    query: { enabled: accessToken !== null },
  });
  const profile = profileData?.data;
  const name = [profile?.firstName, profile?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  const level = actorLevel({ isOwner, isAdmin });

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <Card title={d.accountSection}>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {name && <Field label={d.fieldName}>{name}</Field>}
            <Field label={d.fieldEmail}>{email ?? "—"}</Field>
            <Field label={d.fieldRole}>
              {arePermissionsLoading ? (
                "—"
              ) : (
                <Badge variant={levelBadgeVariant(level)}>
                  {level === ACCESS_LEVEL.OWNER
                    ? d.levelOwner
                    : levelLabel(level)}
                </Badge>
              )}
            </Field>
            <Field label={d.fieldUserId} className="sm:col-span-2">
              {userId ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="font-mono text-pill break-all">
                    {userId}
                  </span>
                  <CopyButton
                    value={userId}
                    label={d.copyId}
                    copiedLabel={d.copyIdDone}
                    failedLabel={d.copyIdFailed}
                    ariaLabel={d.copyIdAria}
                  />
                </div>
              ) : (
                "—"
              )}
            </Field>
          </dl>
        </Card>

        <Card title={d.permissionsSection}>
          {isOwner ? (
            <p className="text-sm text-foreground">{d.permissionsOwner}</p>
          ) : arePermissionsLoading ? (
            <p className="text-sm text-muted-foreground">
              {d.permissionsLoading}
            </p>
          ) : permissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {d.permissionsEmpty}
            </p>
          ) : zoned ? (
            <div className="flex flex-col gap-4">
              {zoned.map((group) => (
                <div key={group.zone} className="flex flex-col gap-2">
                  <h4 className="text-sm font-medium text-foreground">
                    {group.label}
                  </h4>
                  <PermissionBadges entries={group.entries} />
                </div>
              ))}
            </div>
          ) : (
            <PermissionBadges entries={labelled} />
          )}
          {!isOwner && !isAdmin && (
            <p className="text-xs text-muted-foreground">
              {d.permissionsMoreHint}
            </p>
          )}
        </Card>
      </div>

      <Card title={d.passwordSection} className="lg:w-105 lg:shrink-0">
        <AdminPasswordChangeForm />
      </Card>
    </div>
  );
}

interface ZonedGroup {
  zone: string;
  label: string;
  entries: PermissionEntryEntity[];
}

/**
 * The held rights under the catalogue's zone headings, or `null` when there are
 * no zones to group by (a manager today — see the component note).
 *
 * The grouping itself is `groupByZone`, the same one the granting screens use,
 * so the profile and the staff card cannot order zones differently. A held key
 * the grantable catalogue does not list (`staff:read`, `audit:read`: real but
 * never granted) goes to a trailing «Інше» group rather than disappearing.
 */
function groupHeldByZone(
  labelled: readonly PermissionEntryEntity[],
  catalogue: readonly GrantablePermissionEntry[],
  zones: readonly PermissionZoneEntry[],
): ZonedGroup[] | null {
  if (zones.length === 0) return null;

  const labelOf = new Map(labelled.map((entry) => [entry.key, entry.label]));
  const held = catalogue
    .filter((entry) => labelOf.has(entry.key))
    .map((entry) => ({
      ...entry,
      label: labelOf.get(entry.key) ?? entry.label,
    }));
  const groups: ZonedGroup[] = groupByZone(held, zones).map((group) => ({
    zone: group.zone,
    label: group.label,
    entries: group.permissions.map(({ key, label }) => ({ key, label })),
  }));

  const inCatalogue = new Set(catalogue.map((entry) => entry.key));
  const rest = labelled.filter((entry) => !inCatalogue.has(entry.key));
  if (rest.length > 0) {
    groups.push({
      zone: "__other",
      label: d.permissionsOtherZone,
      entries: rest,
    });
  }
  return groups;
}

function PermissionBadges({
  entries,
}: {
  entries: readonly PermissionEntryEntity[];
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {entries.map(({ key, label }) => (
        <li key={key}>
          <Badge variant="secondary" title={key}>
            {label}
          </Badge>
        </li>
      ))}
    </ul>
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

function Card({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card",
        className,
      )}
    >
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}
