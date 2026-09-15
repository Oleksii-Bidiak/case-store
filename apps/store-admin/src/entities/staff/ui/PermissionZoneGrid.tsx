"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PERMISSIONS_WITHOUT_ROUTES } from "@/entities/permission";
import { Badge, Button, Checkbox, Separator } from "@/shared/ui";
import { dict } from "@/shared/config";
import type { ZoneGroup } from "../model/permission-zones";

const d = dict.staff;

interface PermissionZoneGridProps {
  groups: readonly ZoneGroup[];
  /** The keys currently ticked. Owned by the caller — this component is dumb. */
  granted: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onToggleZone: (group: ZoneGroup, grant: boolean) => void;
  /**
   * Prefix for the generated checkbox ids. Two grids can be on screen at once
   * (the hiring wizard over the staff list), and duplicate ids would send a
   * label's click to the wrong box.
   */
  idPrefix: string;
  disabled?: boolean;
  /**
   * Permissions to badge «не діє» — they exist in the catalogue but no endpoint
   * requires them, so ticking one grants nothing (see the constant's own note:
   * the owner ticks «Повертати гроші», believes the refund desk is delegated,
   * and learns months later that the manager was hitting 403 throughout).
   *
   * Injectable so the badge stays testable while the real set is empty — which it
   * is, and which is the correct steady state. A test bound to the live constant
   * would silently stop asserting anything and the mechanism would rot unnoticed
   * until the next time somebody shipped a permission ahead of its endpoint.
   */
  permissionsWithoutRoutes?: ReadonlySet<string>;
}

/**
 * The zone accordion: every grantable permission, grouped by the zone the
 * backend catalogue assigns it, with a whole-zone tick at each heading.
 *
 * Kept from the retired `PermissionMatrixForm` (TASK-334) because the shape was
 * right and only its subject changed — it used to edit what a ROLE could do and
 * now edits what a PERSON or a TEMPLATE carries. Three screens render it: the
 * hiring wizard's third step, the staff card's «Права» tab and the template
 * editor. Extracted to the entity layer rather than copied into each, since a
 * grid that behaves differently in the wizard than on the card is precisely how
 * an owner ends up believing they granted something they did not.
 *
 * Deliberately state-free about WHAT is ticked: the caller owns `granted`,
 * because on two of the three screens that set is a form value that has to
 * resynchronise with server data (see `docs/conventions/forms.md`). What this
 * component does own is which zones are expanded, which is pure view state and
 * belongs nowhere else.
 *
 * The permission KEY is printed next to its Ukrainian label on purpose: when an
 * operator reports "I get 403 on X", the key is the only thing that maps their
 * screen to the guard that refused them.
 */
export function PermissionZoneGrid({
  groups,
  granted,
  onToggle,
  onToggleZone,
  idPrefix,
  disabled = false,
  permissionsWithoutRoutes = PERMISSIONS_WITHOUT_ROUTES,
}: PermissionZoneGridProps) {
  const [expandedZones, setExpandedZones] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

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

  return (
    <ul className="flex flex-col gap-3">
      {groups.map((group) => {
        const total = group.permissions.length;
        const grantedHere = group.permissions.filter((permission) =>
          granted.has(permission.key),
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
                checked={
                  allGranted
                    ? true
                    : grantedHere === 0
                      ? false
                      : "indeterminate"
                }
                disabled={disabled}
                aria-label={d.zoneToggleAria(group.label)}
                onCheckedChange={(checked) =>
                  onToggleZone(group, checked === true)
                }
              />
              <span className="font-medium text-foreground">{group.label}</span>
              <Badge variant={grantedHere === 0 ? "secondary" : "default"}>
                {allGranted
                  ? d.zoneAll
                  : grantedHere === 0
                    ? d.zoneNone
                    : d.zonePartial(grantedHere, total)}
              </Badge>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto gap-1"
                aria-expanded={expanded}
                // Without `aria-controls` a screen reader announces "expanded"
                // and nothing else: the state is reported, the thing it belongs
                // to is not. The id is prefixed the same way the checkbox ids
                // are, so two grids on one page (the wizard mounts one per step)
                // do not collide.
                aria-controls={`${idPrefix}-zone-${group.zone}`}
                aria-label={
                  expanded
                    ? d.zoneCollapseAria(group.label)
                    : d.zoneExpandAria(group.label)
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
                <ul
                  id={`${idPrefix}-zone-${group.zone}`}
                  aria-label={group.label}
                  className="flex flex-col gap-2 pl-7"
                >
                  {group.permissions.map((permission) => (
                    <li
                      key={permission.key}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <Checkbox
                        id={`${idPrefix}-${permission.key}`}
                        checked={granted.has(permission.key)}
                        disabled={disabled}
                        onCheckedChange={() => onToggle(permission.key)}
                      />
                      <label
                        htmlFor={`${idPrefix}-${permission.key}`}
                        className="text-sm text-foreground"
                      >
                        {permission.label}
                      </label>
                      <code className="text-xs text-muted-foreground">
                        {permission.key}
                      </code>
                      {permissionsWithoutRoutes.has(permission.key) && (
                        <Badge
                          variant="destructive"
                          title={d.badgeNoRouteTitle}
                        >
                          {d.badgeNoRoute}
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
  );
}
