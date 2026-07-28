"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  PERMISSIONS_WITHOUT_ROUTES,
  getPermissionControllerGetMatrixQueryKey,
  usePermissionControllerUpdateGrants,
  type PermissionCatalogueEntry,
  type PermissionMatrixEntity,
} from "@/entities/permission";
import { getGetMyPermissionsQueryKey } from "@/entities/session";
import { Badge, Button, Checkbox, Separator } from "@/shared/ui";
import { apiErrorMessage } from "@/shared/lib";
import { dict } from "@/shared/config";

/** A zone heading plus the catalogue entries that carry it. */
interface ZoneGroup {
  zone: string;
  label: string;
  permissions: PermissionCatalogueEntry[];
}

/**
 * Group the catalogue by `zone`, in the order the API lists the zones.
 *
 * Built from the RESPONSE, never from a hardcoded list — that is the whole
 * design of the permission model. A new admin section joins this screen by
 * being declared in `permission.catalog.ts` with a `zone`, with no change here
 * and no migration.
 *
 * A permission whose zone is missing from `zones` still gets a group (labelled
 * with the raw zone key) and is appended after the known ones. Dropping it would
 * be the dangerous failure: an owner would never see that the permission exists,
 * and "granted to nobody" would look like a deliberate decision.
 */
export function groupByZone(matrix: PermissionMatrixEntity): ZoneGroup[] {
  const byZone = new Map<string, PermissionCatalogueEntry[]>();
  for (const entry of matrix.catalogue) {
    const bucket = byZone.get(entry.zone);
    if (bucket) {
      bucket.push(entry);
    } else {
      byZone.set(entry.zone, [entry]);
    }
  }

  const groups: ZoneGroup[] = [];
  const seen = new Set<string>();

  for (const zone of matrix.zones) {
    const permissions = byZone.get(zone.zone);
    seen.add(zone.zone);
    if (permissions && permissions.length > 0) {
      groups.push({ zone: zone.zone, label: zone.label, permissions });
    }
  }

  for (const [zone, permissions] of byZone) {
    if (!seen.has(zone)) {
      groups.push({ zone, label: zone, permissions });
    }
  }

  return groups;
}

/**
 * Permission keys held by nobody at all — no grantable role has a row for them.
 *
 * Rendered as a «Нове» badge because that is exactly the state a freshly shipped
 * admin section starts in: default-denied, waiting for the owner's decision. The
 * alternative (shipping a section already granted to every existing manager) is
 * the failure mode the whole default-deny rule exists to prevent, so the screen
 * says out loud that a decision is pending rather than letting the empty
 * checkbox read as "considered and declined".
 */
export function ungrantedKeys(matrix: PermissionMatrixEntity): Set<string> {
  const granted = new Set<string>();
  for (const entry of matrix.grants) {
    for (const key of entry.permissions) {
      granted.add(key);
    }
  }
  return new Set(
    matrix.catalogue.map((c) => c.key).filter((key) => !granted.has(key)),
  );
}

interface PermissionMatrixFormProps {
  matrix: PermissionMatrixEntity;
  /**
   * Permissions to badge as «Не діє». Injectable so the badge mechanism stays
   * testable once the real set is empty — which it is today. A test bound to the
   * live constant would silently stop asserting anything the moment every
   * permission gained a route, and the badge would rot unnoticed until the next
   * time someone shipped one ahead of its endpoint.
   */
  permissionsWithoutRoutes?: ReadonlySet<string>;
}

/**
 * The owner's permission-matrix editor (TASK-334).
 *
 * ADMIN is never rendered as an editable column: the owner holds everything by
 * construction and is not subject to the matrix, so a column of ticked, disabled
 * boxes would only invite someone to try unticking one. The server rejects
 * `role: ADMIN` on the PUT for the same reason. Should the API ever start
 * offering ADMIN in `grantableRoles`, the filter below still drops it — a
 * matrix that can revoke the owner's own access is a lockout waiting to happen.
 */
export function PermissionMatrixForm({
  matrix,
  permissionsWithoutRoutes = PERMISSIONS_WITHOUT_ROUTES,
}: PermissionMatrixFormProps) {
  const queryClient = useQueryClient();
  const updateGrants = usePermissionControllerUpdateGrants();

  const roles = useMemo(
    () => matrix.grantableRoles.filter((role) => role !== "ADMIN"),
    [matrix.grantableRoles],
  );

  const [selectedRole, setSelectedRole] = useState<string>(roles[0] ?? "");
  const [expandedZones, setExpandedZones] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const serverGrants = useMemo(() => {
    const entry = matrix.grants.find((g) => g.role === selectedRole);
    return [...(entry?.permissions ?? [])].sort();
  }, [matrix.grants, selectedRole]);

  // forms.md Rule 1a — this state is seeded from async server data, so it is
  // resynchronised during render (no effect, no extra render pass) whenever the
  // selected role changes or the matrix is refetched. Seeding `useState` once
  // and forgetting would leave the editor showing the grants of whichever role
  // happened to be selected when the first response landed.
  const signature = `${selectedRole}::${serverGrants.join(",")}`;
  const [syncedSignature, setSyncedSignature] = useState(signature);
  const [granted, setGranted] = useState<ReadonlySet<string>>(
    () => new Set(serverGrants),
  );
  if (signature !== syncedSignature) {
    setSyncedSignature(signature);
    setGranted(new Set(serverGrants));
  }

  const groups = useMemo(() => groupByZone(matrix), [matrix]);
  const ungranted = useMemo(() => ungrantedKeys(matrix), [matrix]);

  const isDirty =
    granted.size !== serverGrants.length ||
    serverGrants.some((key) => !granted.has(key));

  const toggleOne = (key: string) => {
    setGranted((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleZone = (group: ZoneGroup, grant: boolean) => {
    setGranted((current) => {
      const next = new Set(current);
      for (const permission of group.permissions) {
        if (grant) {
          next.add(permission.key);
        } else {
          next.delete(permission.key);
        }
      }
      return next;
    });
  };

  const toggleExpanded = (zone: string) => {
    setExpandedZones((current) => {
      const next = new Set(current);
      if (next.has(zone)) {
        next.delete(zone);
      } else {
        next.add(zone);
      }
      return next;
    });
  };

  const handleSave = () => {
    if (!selectedRole) return;

    updateGrants.mutate(
      {
        data: {
          role: selectedRole as never,
          permissions: [...granted].sort(),
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getPermissionControllerGetMatrixQueryKey(),
          });
          // The actor's own effective permissions can change here too (the
          // owner is unaffected, but a second browser tab signed in as the
          // edited role should not keep its old menu).
          void queryClient.invalidateQueries({
            queryKey: getGetMyPermissionsQueryKey(),
          });
          toast.success(dict.permissionsMatrix.toastSaved);
        },
        onError: (error) => {
          // The API refuses to leave the shop without a working administrator,
          // and the refusal explains itself far better than a generic toast.
          toast.error(
            apiErrorMessage(error) ?? dict.permissionsMatrix.toastFailed,
          );
        },
      },
    );
  };

  const newCount = ungranted.size;

  if (roles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {dict.permissionsMatrix.ownerNote}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        {dict.permissionsMatrix.ownerNote}
      </p>

      {newCount > 0 && (
        <p
          role="status"
          className="rounded-md border border-border bg-muted/50 p-3 text-sm text-foreground"
        >
          {dict.permissionsMatrix.newSummary(newCount)}
        </p>
      )}

      {roles.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group">
          {roles.map((role) => (
            <Button
              key={role}
              type="button"
              size="sm"
              variant={role === selectedRole ? "default" : "outline"}
              aria-pressed={role === selectedRole}
              onClick={() => setSelectedRole(role)}
            >
              {role === "MANAGER" ? dict.permissionsMatrix.roleManager : role}
            </Button>
          ))}
        </div>
      )}

      <h3 className="text-sm font-semibold text-foreground">
        {dict.permissionsMatrix.roleColumn(
          selectedRole === "MANAGER"
            ? dict.permissionsMatrix.roleManager
            : selectedRole,
        )}
      </h3>

      <ul className="flex flex-col gap-3">
        {groups.map((group) => {
          const total = group.permissions.length;
          const grantedHere = group.permissions.filter((p) =>
            granted.has(p.key),
          ).length;
          const allGranted = grantedHere === total;
          const expanded = expandedZones.has(group.zone);

          return (
            <li
              key={group.zone}
              className="rounded-md border border-border p-3 shadow-card"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Checkbox
                  checked={allGranted}
                  aria-label={dict.permissionsMatrix.zoneToggleAria(
                    group.label,
                  )}
                  onCheckedChange={(checked) =>
                    toggleZone(group, checked === true)
                  }
                />
                <span className="font-medium text-foreground">
                  {group.label}
                </span>
                <Badge variant={grantedHere === 0 ? "secondary" : "default"}>
                  {allGranted
                    ? dict.permissionsMatrix.zoneAll
                    : grantedHere === 0
                      ? dict.permissionsMatrix.zoneNone
                      : dict.permissionsMatrix.zonePartial(grantedHere, total)}
                </Badge>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto gap-1"
                  aria-expanded={expanded}
                  aria-label={
                    expanded
                      ? dict.permissionsMatrix.zoneCollapseAria(group.label)
                      : dict.permissionsMatrix.zoneExpandAria(group.label)
                  }
                  onClick={() => toggleExpanded(group.zone)}
                >
                  {expanded ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </Button>
              </div>

              {expanded && (
                <>
                  <Separator className="my-3" />
                  <ul className="flex flex-col gap-2 pl-7">
                    {group.permissions.map((permission) => (
                      <li
                        key={permission.key}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <Checkbox
                          id={`perm-${permission.key}`}
                          checked={granted.has(permission.key)}
                          onCheckedChange={() => toggleOne(permission.key)}
                        />
                        <label
                          htmlFor={`perm-${permission.key}`}
                          className="text-sm text-foreground"
                        >
                          {permission.label}
                        </label>
                        <code className="text-xs text-muted-foreground">
                          {permission.key}
                        </code>
                        {ungranted.has(permission.key) && (
                          <Badge
                            variant="warning"
                            title={dict.permissionsMatrix.badgeNewTitle}
                          >
                            {dict.permissionsMatrix.badgeNew}
                          </Badge>
                        )}
                        {permissionsWithoutRoutes.has(permission.key) && (
                          <Badge
                            variant="destructive"
                            title={dict.permissionsMatrix.badgeNoRouteTitle}
                          >
                            {dict.permissionsMatrix.badgeNoRoute}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || updateGrants.isPending}
        >
          {updateGrants.isPending
            ? dict.permissionsMatrix.saving
            : dict.permissionsMatrix.save}
        </Button>
        {isDirty && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setGranted(new Set(serverGrants))}
              disabled={updateGrants.isPending}
            >
              {dict.permissionsMatrix.reset}
            </Button>
            <span className="text-sm text-muted-foreground">
              {dict.permissionsMatrix.dirtyHint}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
