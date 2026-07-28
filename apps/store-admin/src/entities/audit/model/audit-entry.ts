import type { AuditLogEntity } from "@/shared/api";

/**
 * An audit-log row in the shape the UI actually needs.
 *
 * WHY THIS ADAPTER EXISTS: `AuditLogEntity`'s nullable fields are annotated on
 * the API as `@ApiProperty({ nullable: true })` with no `type`, so the OpenAPI
 * schema carries no type at all and Orval renders them as
 * `{ [key: string]: unknown } | null`. At runtime they are plain strings (and
 * `diff` a plain object). Rendering the generated type directly does not
 * compile, and casting at each of the six use sites would scatter six silent
 * lies through the view.
 *
 * So the coercion happens exactly once, here, and it is defensive rather than a
 * blind cast: a value that is not a string becomes `null` instead of being
 * stringified into `[object Object]`. The real fix is widening the
 * `@ApiProperty` annotations in `apps/store-api/src/audit/entities` — out of
 * this branch's scope, logged in docs/manual-qa-pending.md §TASK-334.
 */
export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  diff: Record<string, { from?: unknown; to?: unknown }> | null;
  createdAt: string;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asDiff(
  value: unknown,
): Record<string, { from?: unknown; to?: unknown }> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, { from?: unknown; to?: unknown }>;
}

export function toAuditEntry(row: AuditLogEntity): AuditEntry {
  return {
    id: row.id,
    actorId: asString(row.actorId),
    actorEmail: asString(row.actorEmail),
    actorRole: asString(row.actorRole),
    action: row.action,
    entityType: asString(row.entityType),
    entityId: asString(row.entityId),
    summary: asString(row.summary),
    diff: asDiff(row.diff),
    createdAt: row.createdAt,
  };
}
