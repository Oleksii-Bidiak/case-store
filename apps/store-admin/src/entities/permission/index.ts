// Permission entity — what this session may do (TASK-334 / TASK-475).
//
// The role-matrix hooks (`usePermissionControllerGetMatrix`,
// `usePermissionControllerUpdateGrants`) were re-exported here until TASK-475
// deleted `/api/admin/permissions` along with the matrix itself. Rights belong to
// a person now, and the per-person client lives in `@/entities/staff`
// (TASK-480) — beside the register it edits, because «what may Olena do?» is a
// question about a PERSON.
//
// What stays here is what the admin UI itself has to name in code: the key
// constants the nav and the row actions reference. The «не діє» set that
// `PermissionZoneGrid` badges moved to `@/entities/staff` (TASK-640) — the grid
// was its only reader, and importing it from here was one of the only two
// entity→entity imports in the admin.

export type { EffectivePermissionsEntity } from "@/shared/api";

export { PERM, type PermissionKey } from "./model/permission-keys";
