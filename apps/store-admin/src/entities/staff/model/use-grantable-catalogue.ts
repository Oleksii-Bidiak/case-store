"use client";

import { useGetStaffPermissions } from "@/shared/api";
import type {
  GrantablePermissionEntry,
  PermissionZoneEntry,
} from "@/shared/api";

export interface GrantableCatalogue {
  catalogue: GrantablePermissionEntry[];
  zones: PermissionZoneEntry[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * The grantable permission catalogue, for the two screens that need it WITHOUT a
 * target person: the hiring wizard (the employee does not exist yet) and the
 * template editor (a template is about nobody in particular).
 *
 * WHY IT READS THE CALLER'S OWN `staff/:id/permissions`. There is no standalone
 * catalogue endpoint, and adding one would be a second place for the zone list to
 * drift out of step with `permission.catalog.ts`. `GET /api/admin/staff/
 * :id/permissions` already returns the FULL grantable catalogue alongside that
 * person's keys — the response was shaped that way so one call feeds the whole
 * screen — and the caller of these screens is by construction a staff account
 * holding `staff:read` (they could not be here otherwise), so their own id always
 * resolves. Only `catalogue` and `zones` are read here; the caller's own granted
 * keys are ignored.
 *
 * Non-grantable keys (`staff:read`, `staff:write`, `audit:read`) are absent from
 * the catalogue server-side, so no screen built on this hook can render a box
 * that must not be ticked.
 *
 * `userId` is the CALLER's own id, passed in by the feature that renders the
 * screen (TASK-640). The hook used to read it from `@/entities/session` itself,
 * which made it one of the only two entity→entity imports in the admin; the
 * session is a sibling entity, so the feature layer — which may import both —
 * joins them. `null`/`undefined` (a session with no id yet) disables the query.
 */
export function useGrantableCatalogue(
  userId: string | null | undefined,
  options: { enabled?: boolean } = {},
): GrantableCatalogue {
  const enabled = (options.enabled ?? true) && Boolean(userId);

  const { data, isLoading, isError } = useGetStaffPermissions(userId ?? "", {
    query: { enabled },
  });

  return {
    catalogue: data?.data.catalogue ?? [],
    zones: data?.data.zones ?? [],
    // `isLoading` is true for a disabled query too, which would leave a skeleton
    // on screen forever for a session with no id. Report "not loading" then and
    // let the caller render its empty state.
    isLoading: enabled && isLoading,
    isError,
  };
}
