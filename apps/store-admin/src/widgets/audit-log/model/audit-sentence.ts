import type { AuditEntry } from "@/entities/audit";
import {
  formatOrderNumber,
  orderStatusLabel,
  paymentStatusLabel,
} from "@/entities/order";
import { returnStatusLabel } from "@/entities/return";
import { roleLabel } from "@/entities/user";
import { dict } from "@/shared/config";
import { countLabel, formatCurrency } from "@/shared/lib";

const d = dict.auditLog;

// Looked up by a runtime string — the one place a wider index type is right.
const ACTION_VERBS: Record<string, string | undefined> = d.actionVerbs;
const ENTITY_NOUNS: Record<string, string | undefined> = d.entityNouns;
const FIELD_LABELS: Record<string, string | undefined> = d.fieldLabels;

/**
 * Where an object lives in the panel — only for the entity types whose audit
 * `entityId` IS that record's id (the interceptor keys by the route's own id;
 * see `resolveEntityId` in store-api). Anything else is named, not linked: a
 * link that lands on the wrong record is worse than none.
 */
const ENTITY_HREFS: Record<string, (id: string) => string> = {
  order: (id) => `/orders/${id}`,
  return: (id) => `/returns/${id}`,
  product: (id) => `/products/${id}`,
  staff: (id) => `/staff/${id}`,
  user: (id) => `/users/${id}`,
  category: (id) => `/categories/${id}/edit`,
  brand: (id) => `/brands/${id}/edit`,
  discount: (id) => `/discounts/${id}/edit`,
  blog: (id) => `/blog/${id}/edit`,
  banner: (id) => `/banners/${id}/edit`,
};

/** Request-plumbing keys that say nothing to a person reading the log. */
const TECHNICAL_FIELDS = new Set(["expectedUpdatedAt"]);

/** Fields holding money, printed as «1 299 ₴». */
const MONEY_FIELDS = new Set([
  "price",
  "compareAtPrice",
  "refundedAmount",
  "minSpend",
  "amount",
  "total",
  "shippingCost",
]);

const capitalize = (text: string) =>
  text ? text.charAt(0).toLocaleUpperCase("uk") + text.slice(1) : text;

export interface AuditSentence {
  /** «Змінено статус» — or the raw action key when the panel cannot name it. */
  verb: string;
  /** `true` when {@link verb} is the raw key (render it as code). */
  raw: boolean;
  /** «замовлення #7C1E4B2A» — what was acted on, when the entry says. */
  object: { text: string; href?: string } | null;
}

/** Fixed ids of settings singletons: `00000000-0000-0000-0000-00000000000N`. */
const NIL_ID = /^0{8}(-0{4}){3}-0{8}[0-9a-f]{4}$/i;

/** The type an entry is about — its own field, else the action's first half. */
function entityTypeOf(entry: Pick<AuditEntry, "action" | "entityType">) {
  return entry.entityType ?? entry.action.split(".")[0] ?? "";
}

/**
 * «що зроблено + з чим» (AuditLogProposal Ж1, TASK-1068) from what the entry
 * already carries: the verb half of the action key, a noun for the entity type
 * and the short id. The object's NAME («Силіконовий чохол…») is not in the
 * entry — that is the API tail of TASK-1068 — so the object reads as
 * «товар #0B9D2F4E» and links to the record where the panel has a page for it.
 *
 * Never invents: an action whose verb is unknown comes back as the raw key —
 * exactly what the log showed before labels existed (TASK-430).
 */
export function auditSentence(entry: AuditEntry): AuditSentence {
  const dot = entry.action.indexOf(".");
  const verbKey = dot > 0 ? entry.action.slice(dot + 1) : "";
  const verb = ACTION_VERBS[verbKey];
  const type = entityTypeOf(entry);
  const noun = ENTITY_NOUNS[type];
  // Settings singletons (site contacts, SEO) live under fixed zero ids:
  // «контакти сайту #00000000» names nothing, so they read without a number.
  const ref =
    entry.entityId && !NIL_ID.test(entry.entityId)
      ? formatOrderNumber(entry.entityId)
      : null;

  const text = [noun, ref].filter(Boolean).join(" ");
  const href =
    entry.entityId && ENTITY_HREFS[type]
      ? ENTITY_HREFS[type](entry.entityId)
      : undefined;

  return {
    verb: verb ? capitalize(verb) : entry.action,
    raw: !verb,
    object: text ? { text, href } : null,
  };
}

/** The sentence as one plain line — the row's accessible name. */
export function auditSentenceText(entry: AuditEntry): string {
  const sentence = auditSentence(entry);
  return sentence.object
    ? `${sentence.verb} ${sentence.object.text}`
    : sentence.verb;
}

/* ── What changed ───────────────────────────────────────────────────────── */

export interface AuditChange {
  field: string;
  /** «Ціна» — or the raw key when the panel has no name for it. */
  label: string;
  /** `null` when the entry did not record the value before the change. */
  from: string | null;
  to: string;
}

/** One value in words: statuses by their labels, money in ₴, yes/no. */
export function auditValue(
  field: string,
  value: unknown,
  entityType: string,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? d.valueYes : d.valueNo;
  if (typeof value === "string") {
    if (field === "status") {
      if (entityType === "order") return orderStatusLabel(value);
      if (entityType === "return") return returnStatusLabel(value);
    }
    if (field === "paymentStatus") return paymentStatusLabel(value);
    if (field === "role") return roleLabel(value);
    if (MONEY_FIELDS.has(field) && /^-?\d+(\.\d+)?$/.test(value)) {
      return formatCurrency(value);
    }
    return value;
  }
  if (typeof value === "number") {
    return MONEY_FIELDS.has(field)
      ? formatCurrency(value)
      : value.toLocaleString("uk-UA");
  }
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item !== "object" || item === null)) {
      return value.length ? value.map(String).join(", ") : "—";
    }
    return countLabel(value.length, d.itemForms);
  }
  return JSON.stringify(value);
}

/**
 * «Поле · Було · Стало» (Ж2) from the entry's `diff`. Most entries record the
 * request body only — `{ field: { to } }` — so «Було» is often unknown; the
 * before-image is written only by the routes that record their own entry
 * (permissions, ownership). Human «Було» everywhere is an API tail.
 */
export function auditChanges(entry: AuditEntry): AuditChange[] {
  if (!entry.diff) return [];
  const type = entityTypeOf(entry);
  return Object.entries(entry.diff)
    .filter(([field]) => !TECHNICAL_FIELDS.has(field))
    .map(([field, change]) => {
      const hasFrom =
        change !== null &&
        typeof change === "object" &&
        Object.prototype.hasOwnProperty.call(change, "from");
      return {
        field,
        label: FIELD_LABELS[field] ?? field,
        from: hasFrom ? auditValue(field, change.from, type) : null,
        to: auditValue(field, change?.to, type),
      };
    });
}

const MAX_INLINE = 3;
const MAX_VALUE = 60;

const clip = (text: string) =>
  text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text;

/** «Статус → Відправлено · Ціна: 1 599 ₴ → 1 299 ₴ · ще 2» — under the sentence. */
export function auditChangesLine(changes: readonly AuditChange[]): string {
  const shown = changes
    .slice(0, MAX_INLINE)
    .map((change) =>
      change.from === null
        ? d.changeTo(change.label, clip(change.to))
        : d.changeFromTo(change.label, clip(change.from), clip(change.to)),
    );
  const more = changes.length - MAX_INLINE;
  if (more > 0) shown.push(d.moreChanges(more));
  return shown.join(" · ");
}
