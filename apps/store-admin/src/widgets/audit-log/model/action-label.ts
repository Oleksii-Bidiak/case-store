import { dict } from "@/shared/config";

const d = dict.auditLog;

// The dictionary declares these as object literals (so a typo in a key is a
// compile error where they are WRITTEN); here they are looked up by a runtime
// string, which is the one place a wider index type is correct.
const ENTITY_LABELS: Record<string, string | undefined> = d.entityLabels;
const ACTION_VERBS: Record<string, string | undefined> = d.actionVerbs;

/**
 * Ukrainian name for one audit action — or `null` when the panel cannot name it
 * (TASK-430).
 *
 * ── The shape of an action, and why this composes ───────────────────────────
 * `AuditInterceptor` builds every action as `<entityType>.<handlerName>`, from the
 * controller's class name and the method's name. Neither half is a catalogue
 * anybody maintains: they are derived at runtime, so the set changes whenever a
 * guarded route is added. That rules out a flat map of finished labels as the
 * primary form — it would need one entry per route (110 today) and would be
 * incomplete the same afternoon.
 *
 * So the label is composed: the entity half is the name the entity FILTER already
 * needs, the verb half is the only genuinely new list, and a new module whose
 * routes are the usual create/update/delete gets a readable label from one new
 * entry rather than six.
 *
 * ── Returning null is the point ─────────────────────────────────────────────
 * This function never invents a label. An action it cannot resolve comes back as
 * `null` and the caller renders the RAW KEY — precisely what the column showed
 * before this existed. Degrading to the old behaviour is what makes an incomplete
 * map safe to ship; hiding the row, or printing «Невідома дія», would lose
 * information on the one screen whose entire job is not losing any.
 *
 * `audit-action-labels.spec.ts` (store-api) walks the real controllers and fails
 * the build when an audited action has no label here, so "incomplete" stays a
 * temporary state rather than a permanent one.
 */
export function auditActionLabel(action: string): string | null {
  const dot = action.indexOf(".");
  // No dot, a leading dot, or a trailing one: not the shape the interceptor
  // writes, so there is nothing to look up.
  if (dot <= 0 || dot === action.length - 1) {
    return null;
  }

  const entity = ENTITY_LABELS[action.slice(0, dot)];
  const verb = ACTION_VERBS[action.slice(dot + 1)];
  if (!entity || !verb) {
    return null;
  }

  return d.actionLabel(entity, verb);
}
