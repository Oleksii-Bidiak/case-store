import {
  AdminReviewControllerListStatus,
  ReviewAuthorVisibility,
  type AdminReviewEntity,
} from "@/entities/review";
import { toKyivDateInput } from "@/shared/lib/format";

type Status = AdminReviewControllerListStatus;
type Visibility = ReviewAuthorVisibility;

const STATUS = AdminReviewControllerListStatus;
const VISIBILITY = ReviewAuthorVisibility;

/**
 * The quick views of the moderation queue (wave 198, TASK-1057,
 * ReviewsProposal В1–В4). They replaced the status and author-visibility
 * selects and write the SAME two URL params those selects wrote, so every link
 * shared before — `?status=rejected`, `?visibility=hidden`, the dashboard's
 * `?status=all&productId=…` — still opens the same rows.
 */
export type ReviewViewId =
  "pending" | "approved" | "rejected" | "abuse" | "hidden" | "all";

export const REVIEW_VIEW_ORDER: readonly ReviewViewId[] = [
  "pending",
  "approved",
  "rejected",
  "abuse",
  "hidden",
  "all",
];

type PresetViewId = Exclude<ReviewViewId, "abuse">;

/**
 * The URL each view writes. Absent = the API's default (`pending` text,
 * `visible` authors), so «На розгляді» is the clean URL.
 *
 * «Приховані автори» lists every verdict of the withdrawn accounts, and «Усі»
 * is every verdict of every author — the withdrawn ones included, as the
 * artboard's В4 shows them.
 */
export const REVIEW_VIEW_PARAMS: Record<
  PresetViewId,
  { status?: Status; visibility?: Visibility }
> = {
  pending: {},
  approved: { status: STATUS.approved },
  rejected: { status: STATUS.rejected },
  hidden: { status: STATUS.all, visibility: VISIBILITY.hidden },
  all: { status: STATUS.all, visibility: VISIBILITY.all },
};

const PRESET_ORDER: readonly PresetViewId[] = [
  "pending",
  "approved",
  "rejected",
  "hidden",
  "all",
];

/**
 * The text queue the URL asks for, defaulting to the one an absent param
 * returns. Reads the generated enum: an unrecognised value falls back to
 * `pending`, the queue the API really serves for it — never to a view that
 * would name one queue over the rows of another.
 */
export function resolveStatus(raw: string | null): Status {
  const known = Object.values(STATUS);
  return known.includes(raw as Status) ? (raw as Status) : STATUS.pending;
}

/** The author slice the URL asks for; the API's own default is `visible`. */
export function resolveVisibility(raw: string | null): Visibility {
  const known = Object.values(VISIBILITY);
  return known.includes(raw as Visibility)
    ? (raw as Visibility)
    : VISIBILITY.visible;
}

export interface ReviewUrlState {
  status: Status;
  visibility: Visibility;
  /** Dashboard deep-link narrowing (TASK-601) — `""` when absent. */
  productId: string;
  createdIp: string;
}

export function readReviewUrl(params: URLSearchParams): ReviewUrlState {
  return {
    status: resolveStatus(params.get("status")),
    visibility: resolveVisibility(params.get("visibility")),
    productId: params.get("productId") ?? "",
    createdIp: params.get("createdIp") ?? "",
  };
}

/**
 * Which view the URL is. A product or address narrowing IS «Сигнали
 * накрутки» — that is what the dashboard's rating-abuse card links to. A
 * combination no view stands for (`?status=approved&visibility=hidden`) is
 * `""`: no view is highlighted and the filter chips name it instead.
 */
export function activeReviewView(state: ReviewUrlState): ReviewViewId | "" {
  if (state.productId || state.createdIp) return "abuse";
  for (const id of PRESET_ORDER) {
    const preset = REVIEW_VIEW_PARAMS[id];
    if (
      (preset.status ?? STATUS.pending) === state.status &&
      (preset.visibility ?? VISIBILITY.visible) === state.visibility
    ) {
      return id;
    }
  }
  return "";
}

/**
 * The list request behind each view's counter: the API's own `meta.total` of a
 * one-row page, never a number derived from the rows on screen. «На розгляді»
 * is spelled exactly as the sidebar badge asks it (`admin-nav-list.tsx`), so
 * the two share one cache entry and cannot disagree.
 */
export const REVIEW_VIEW_COUNT_QUERY: Record<
  PresetViewId,
  { status: Status; visibility?: Visibility; limit: 1 }
> = {
  pending: { status: STATUS.pending, limit: 1 },
  approved: { status: STATUS.approved, limit: 1 },
  rejected: { status: STATUS.rejected, limit: 1 },
  hidden: { status: STATUS.all, visibility: VISIBILITY.hidden, limit: 1 },
  all: { status: STATUS.all, visibility: VISIBILITY.all, limit: 1 },
};

/* ── «Сигнали накрутки» ─────────────────────────────────────────────────── */

/** One flagged situation: a product with a burst, or an address with 1★s. */
export interface AbuseSignal {
  productId?: string;
  createdIp?: string;
}

/** The needs-action payload's `ratingAbuseSignals`, as a flat list. */
export function abuseSignalList(
  signals: { productIds: string[]; createdIps: string[] } | undefined,
): AbuseSignal[] {
  if (!signals) return [];
  return [
    ...signals.productIds.map((productId) => ({ productId })),
    ...signals.createdIps.map((createdIp) => ({ createdIp })),
  ];
}

/** Where the URL's narrowing sits in the list, or `-1`. */
export function abuseSignalIndex(
  signals: readonly AbuseSignal[],
  state: ReviewUrlState,
): number {
  return signals.findIndex((signal) =>
    signal.productId
      ? signal.productId === state.productId
      : signal.createdIp === state.createdIp,
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calendar days the series spans, counted in Kyiv and inclusive — rows on the
 * 25th and the 26th are «за 2 дні», rows within one day are «за 1 день».
 * The Kyiv calendar day comes from the shared formatter (`YYYY-MM-DD`), read
 * back as a UTC midnight only to subtract.
 */
export function kyivDaySpan(dates: readonly string[]): number {
  if (dates.length === 0) return 0;
  const days = dates.map((date) =>
    Date.parse(`${toKyivDateInput(date)}T00:00:00Z`),
  );
  return Math.round((Math.max(...days) - Math.min(...days)) / DAY_MS) + 1;
}

export interface AbuseFacts {
  /** Every rating on the page is 1–2★ — the card says «низькі оцінки». */
  lowOnly: boolean;
  days: number;
  /** Rows from an account that neither bought the product nor wrote a word. */
  suspects: number;
}

/**
 * What the explanation card states about the series — counted from the rows
 * the API returned, so it says nothing the screen does not show.
 */
export function abuseFacts(rows: readonly AdminReviewEntity[]): AbuseFacts {
  return {
    lowOnly: rows.length > 0 && rows.every((row) => row.rating <= 2),
    days: kyivDaySpan(rows.map((row) => row.createdAt)),
    suspects: rows.filter((row) => !row.verifiedPurchase && !row.comment)
      .length,
  };
}
