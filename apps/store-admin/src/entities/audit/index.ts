// Audit entity — the admin action log (TASK-318).
// Re-exports the Orval-generated audit client from the shared layer so widgets
// depend on `@/entities/audit` rather than reaching into `@/shared/api`.

export { useGetAuditLog, getGetAuditLogQueryKey } from "@/shared/api";

// Normalises the generated entity's untyped nullable fields — see the module
// doc for why the API's Swagger annotations force this.
export { toAuditEntry } from "./model/audit-entry";
export type { AuditEntry } from "./model/audit-entry";

export type {
  AuditLogEntity,
  AuditLogListResponseEnvelope,
  AuditLogPaginationMeta,
  GetAuditLogParams,
} from "@/shared/api";
