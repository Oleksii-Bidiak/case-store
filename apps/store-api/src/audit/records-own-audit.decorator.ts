import { SetMetadata } from '@nestjs/common';

export const RECORDS_OWN_AUDIT_KEY = 'recordsOwnAudit';

/**
 * "This handler writes its own audit entry — do not write the generic one"
 * (TASK-477).
 *
 * ── WHY A HANDLER WOULD EVER DO THAT ─────────────────────────────────────────
 *
 * `AuditInterceptor` runs after the handler and has only the REQUEST BODY to
 * describe the change with. For almost every admin mutation that is exactly
 * right: the body IS the change, and deriving the log from the RBAC annotations
 * is what stops the audit surface drifting away from the admin surface.
 *
 * A permission change is the case where it is not enough. The interesting half of
 * «хто тихо видав менеджеру доступ до замовлень?» is the state BEFORE the write,
 * and an interceptor has no pre-image — by the time it runs, the old rows are
 * gone. So `PUT /admin/staff/:id/permissions` and `POST
 * /admin/permission-templates/:id/apply` read the old set inside the same
 * operation that replaces it and record `{ permissions: { from, to } }`
 * themselves.
 *
 * ── WHY THAT NEEDS A DECORATOR AND NOT JUST A SECOND `record()` CALL ─────────
 *
 * Without this mark both would fire, and the owner's log would show the same
 * permission change twice: once with a real before→after diff and once with the
 * submitted list and no history. Two rows for one event on the one screen that
 * exists to answer "what actually happened" is a defect, and the row a reader
 * clicks first would be a coin toss.
 *
 * ── THE RULE FOR USING IT ────────────────────────────────────────────────────
 *
 * Only on a handler that unconditionally calls `AuditService.record()` on its own
 * success path, with the SAME action key the interceptor would have derived
 * (`<entityType>.<handlerName>` — see `entityTypeFromController`). Keeping the key
 * identical is what lets `audit-action-labels.spec.ts` keep policing the
 * Ukrainian labels: the spec derives the action set from the route annotations,
 * so a marked route is still required to have a label, and it still gets one
 * written. This decorator moves WHO writes the row, never WHETHER one is written.
 */
export const RecordsOwnAudit = () => SetMetadata(RECORDS_OWN_AUDIT_KEY, true);
