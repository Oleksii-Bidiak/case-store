import type {
  GrantablePermissionEntry,
  PermissionTemplateEntity,
  PermissionZoneEntry,
} from "@/shared/api";

/** A zone heading plus the catalogue entries that carry it. */
export interface ZoneGroup {
  zone: string;
  label: string;
  permissions: GrantablePermissionEntry[];
}

/**
 * Group a permission catalogue by `zone`, in the order the API lists the zones.
 *
 * Lifted verbatim (bar its parameter shape) from the retired
 * `PermissionMatrixForm`, because the reasoning survived the model change intact:
 * the grouping is built from the RESPONSE, never from a hardcoded list, so a new
 * admin section joins every granting screen by being declared in
 * `permission.catalog.ts` with a zone — no change here and no migration.
 *
 * A permission whose zone is missing from `zones` still gets a group (labelled
 * with the raw zone key) and is appended after the known ones. Dropping it would
 * be the dangerous failure: an owner would never see that the permission exists,
 * and "granted to nobody" would look like a deliberate decision rather than an
 * oversight.
 *
 * TAKES THE TWO LISTS RATHER THAN THE WHOLE ENTITY, because three different
 * screens feed it now — the per-person grid, the hiring wizard and the template
 * editor — and only the first of them has a `StaffPermissionsEntity` to hand.
 *
 * (`ungrantedKeys`, this function's neighbour on the old matrix form, did NOT
 * come across: it answered "which permissions has no role been given?", and that
 * question needed the whole grant matrix in one response. Rights belong to people
 * now, and no endpoint returns every person's rows at once — so the honest answer
 * is that the badge it fed cannot be computed any more, not that it should be
 * approximated from a template list.)
 */
export function groupByZone(
  catalogue: readonly GrantablePermissionEntry[],
  zones: readonly PermissionZoneEntry[],
): ZoneGroup[] {
  const byZone = new Map<string, GrantablePermissionEntry[]>();
  for (const entry of catalogue) {
    const bucket = byZone.get(entry.zone);
    if (bucket) {
      bucket.push(entry);
    } else {
      byZone.set(entry.zone, [entry]);
    }
  }

  const groups: ZoneGroup[] = [];
  const seen = new Set<string>();

  for (const zone of zones) {
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

/** True when the two key lists describe the same set, order and repeats aside. */
export function samePermissionSet(
  a: readonly string[],
  b: readonly string[],
): boolean {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== right.size) return false;
  for (const key of left) {
    if (!right.has(key)) return false;
  }
  return true;
}

/**
 * The template whose set is EXACTLY what this person holds, if there is one.
 *
 * This is the whole of "which template was applied" that the data can support,
 * and saying so is better than pretending otherwise. Applying a template COPIES
 * its keys (plan 181, invariant 5) and stores no link back — deliberately, so
 * that editing a template cannot silently move a working person's access. The
 * consequence is that "Olena is on the Оператор замовлень template" stops being
 * true the moment anybody ticks one extra box for her, and the only honest thing
 * a screen can say afterwards is nothing.
 *
 * Hence: an exact match is reported as a match, anything else as `null`. Never
 * "closest template" — a near-miss label is exactly the false reassurance the
 * copy semantics exist to avoid.
 */
export function matchingTemplate(
  permissions: readonly string[],
  templates: readonly PermissionTemplateEntity[],
): PermissionTemplateEntity | null {
  if (permissions.length === 0) return null;
  return (
    templates.find((template) =>
      samePermissionSet(permissions, template.permissions),
    ) ?? null
  );
}
