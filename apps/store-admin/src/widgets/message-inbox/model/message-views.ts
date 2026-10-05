import { AdminContactListStatus } from "@/entities/contact";
import { formatUAPhone, isValidUAPhone } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.messages;

/**
 * The inbox's quick views (wave 198, TASK-1060, MessagesProposal З1/З4). They
 * write the SAME `?status=` the old select wrote — `?status=NEW`, `?status=SPAM`
 * deep links open the same rows — and «Усі» is no param at all, exactly what
 * the API serves as "everything but spam" (TASK-761).
 */
export const ALL_VIEW = "__all__";

export const MESSAGE_VIEWS: ReadonlyArray<{
  id: string;
  label: string;
  /** What the list is asked for; `undefined` = no `status` param. */
  status?: AdminContactListStatus;
  empty: string;
}> = [
  {
    id: AdminContactListStatus.NEW,
    label: d.filterNew,
    status: AdminContactListStatus.NEW,
    empty: d.emptyNew,
  },
  {
    id: AdminContactListStatus.IN_PROGRESS,
    label: d.filterInProgress,
    status: AdminContactListStatus.IN_PROGRESS,
    empty: d.emptyInProgress,
  },
  {
    id: AdminContactListStatus.READ,
    label: d.filterRead,
    status: AdminContactListStatus.READ,
    empty: d.emptyRead,
  },
  {
    id: AdminContactListStatus.ARCHIVED,
    label: d.viewArchived,
    status: AdminContactListStatus.ARCHIVED,
    empty: d.emptyArchived,
  },
  {
    id: AdminContactListStatus.SPAM,
    label: d.filterSpam,
    status: AdminContactListStatus.SPAM,
    empty: d.emptySpam,
  },
  { id: ALL_VIEW, label: d.filterAll, empty: d.empty },
];

/** Narrow a raw `?status=` to a known status, or `undefined` for «Усі». */
export function parseStatus(
  raw: string | null,
): AdminContactListStatus | undefined {
  const known = Object.values(AdminContactListStatus) as string[];
  return raw && known.includes(raw)
    ? (raw as AdminContactListStatus)
    : undefined;
}

/** The view a (resolved) status stands for. */
export function activeMessageView(
  status: AdminContactListStatus | undefined,
): string {
  return status ?? ALL_VIEW;
}

/** «+380 67 123 4567» for a Ukrainian number; anything else as typed. */
export function phoneText(raw: string): string {
  return isValidUAPhone(raw) ? formatUAPhone(raw) : raw;
}

const TOPIC_LABELS: Record<string, string> = {
  order: d.topicOrder,
  delivery: d.topicDelivery,
  warranty: d.topicWarranty,
  return: d.topicReturn,
  other: d.topicOther,
};

/**
 * The storefront form stores a topic KEY («warranty»); the inbox printed it
 * raw. Known keys read as the form's own labels, anything else as typed.
 */
export function topicLabel(topic: string | null | undefined): string {
  if (!topic) return d.noTopic;
  return TOPIC_LABELS[topic] ?? topic;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_PREFIX = /^#?([0-9a-f]{8})$/i;

/**
 * What a customer-typed order reference points at (З1: «замовлення
 * посиланням»). `orderRef` is free text, so only two shapes are trusted: a
 * full order id (opens the card) and the eight-character number the panel
 * prints, «#7C1E9A42» (opens the order list searched by it — the order search
 * matches the id prefix). Anything else («ORD-10231») stays text: a link that
 * guesses would send the operator to the wrong order.
 */
export function orderRefTarget(
  orderRef: string | null | undefined,
): { id: string; href: string } | null {
  const ref = orderRef?.trim() ?? "";
  if (UUID.test(ref)) return { id: ref, href: `/orders/${ref}` };
  const prefix = ORDER_PREFIX.exec(ref);
  if (prefix) {
    return {
      id: prefix[1].toLowerCase(),
      href: `/orders?search=${prefix[1].toUpperCase()}`,
    };
  }
  return null;
}
