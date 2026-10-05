"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockIcon } from "lucide-react";
import {
  ROLE_VALUES,
  CustomerStatusBadge,
  customerDisplayName,
  customerInitial,
  customerPhone,
  useGetUserAdminCard,
  useUserControllerFindById,
  type CustomerCardContactMessageEntity,
  type UserAdminCardEntity,
  type UserEntity,
} from "@/entities/user";
import {
  OrderNumber,
  orderStatusBadgeVariant,
  orderStatusLabel,
} from "@/entities/order";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { UserBanToggle } from "@/features/user-ban-toggle";
// Imported from the slice, not the `@/features` barrel: the barrel is one file
// every parallel branch appends to, and this widget needs nothing else from it.
import { UserNotesPanel } from "@/features/user-notes";
import {
  ChangeUserEmailDialog,
  DeleteUserDialog,
  UserRoleChange,
} from "@/features/user-account-actions";
import {
  Badge,
  Button,
  Callout,
  CopyButton,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { formatCurrency, formatDate, formatDateTime } from "@/shared/lib";
import { useNow } from "@/shared/lib/use-now";
import { dict } from "@/shared/config";
import { UserDetailSkeleton } from "./UserDetailSkeleton";

const d = dict.users;

/**
 * The card endpoint returns at most this many reviews
 * (`CUSTOMER_CARD_REVIEWS_LIMIT` in store-api). A full page means "at least",
 * so the KPI says «20+» instead of pretending to know the total.
 */
const CARD_REVIEWS_LIMIT = 20;

interface UserDetailViewProps {
  userId: string;
}

/** Ukrainian labels for the contact-message inbox status (reused from messages). */
const CONTACT_STATUS_LABELS: Record<string, string> = {
  NEW: dict.messages.statusNew,
  IN_PROGRESS: dict.messages.statusInProgress,
  READ: dict.messages.statusRead,
  ARCHIVED: dict.messages.statusArchived,
};

function contactStatusLabel(status: string): string {
  return CONTACT_STATUS_LABELS[status] ?? status;
}

/**
 * Ukrainian labels for a review text's moderation verdict (TASK-446): three
 * values, because a rejected text survives its own rejection.
 */
const REVIEW_STATUS_LABELS: Record<string, string> = {
  PENDING: d.cardReviewPending,
  APPROVED: d.cardReviewApproved,
  REJECTED: d.cardReviewRejected,
};

function reviewStatusLabel(status: string): string {
  return REVIEW_STATUS_LABELS[status] ?? status;
}

/**
 * Badge canon (§1.6): a rejected text is a moderation verdict, not an error,
 * so it is grey — `destructive` is kept for real failures.
 */
function reviewBadgeVariant(
  status: string,
): "success" | "warning" | "secondary" {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "secondary";
  return "warning";
}

/**
 * Admin customer card (TASK-252), laid out by UsersProposal К4–К7 (wave 198,
 * TASK-1058): a header with the name, the address, the phone and «клієнт з …»;
 * the KPI row; orders, reviews, coupons, messages and the notes journal in the
 * main column; access, account management and metadata on the side.
 *
 * TWO READS SINCE TASK-479, AND WHICH ONE RUNS IS A PERMISSION QUESTION. The card
 * endpoint is behind `customers:card`; the list and the plain profile stay under
 * `customers:read`. Without the card key the card request is never SENT — a
 * request that can only answer 403 would arrive as the red «не вдалося
 * завантажити» banner, telling the operator the screen is broken when the truth
 * is that this part was never granted. One honest line stands in for it (К7).
 *
 * «Роль співробітника» is GONE from this card (owner decision 2026-09-30): panel
 * access is given only in «Співробітники», through the hiring wizard, which
 * promotes an existing customer by address. Its place holds that sentence and
 * the link, behind the same `staff:write` the control had.
 */
export function UserDetailView({ userId }: UserDetailViewProps) {
  const router = useRouter();
  const { isOwner, can } = useAuth();
  const canReadCard = can(PERM.customersCard);
  // Giving panel access is `staff:write` on the API (the hiring wizard and the
  // role route); deleting a shopper stayed `@OwnerOnly()`. Two gates, two routes.
  const canManageStaff = can(PERM.staffWrite);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [mountedAt] = useState(() => Date.now());
  const now = useNow(60_000) ?? mountedAt;

  // Exactly one of these is ever enabled, so the screen makes one request.
  const cardQuery = useGetUserAdminCard(userId, {
    query: { enabled: canReadCard },
  });
  const profileQuery = useUserControllerFindById(userId, {
    query: { enabled: !canReadCard },
  });

  const { isLoading, isError, error } = canReadCard ? cardQuery : profileQuery;
  const card = cardQuery.data?.data;
  const user = card?.user ?? profileQuery.data?.data;

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/users");
    }
  }, [isNotFound, router]);

  if (isLoading) {
    return <UserDetailSkeleton />;
  }

  if (isError && !isNotFound) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {d.loadOneError}
      </p>
    );
  }

  if (!user) {
    return null;
  }

  const name = customerDisplayName(user);
  const hasName = name !== user.email;
  const phone = customerPhone(user.phone);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/users"
          className="w-fit rounded-xs text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {d.back}
        </Link>
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-semibold text-muted-foreground"
          >
            {customerInitial(user)}
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 font-display text-2xl font-semibold tracking-tight break-words text-foreground">
                {name}
              </h2>
              <CustomerStatusBadge isActive={user.isActive} />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
              {hasName && <span className="break-all">{user.email}</span>}
              <EmailVerificationBadge verifiedAt={user.emailVerifiedAt} />
              {phone && (
                <>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ·
                  </span>
                  <span className="tabular-nums">{phone}</span>
                </>
              )}
              <span aria-hidden="true" className="text-muted-foreground">
                ·
              </span>
              <span className="text-xs text-muted-foreground">
                {d.customerSince(formatDate(user.createdAt))}
              </span>
            </div>
            {/* TASK-430: null means "we do not know", not "they refused" —
                every account created before verification existed is null. */}
            {!user.emailVerifiedAt && (
              <p className="max-w-2xl text-xs text-muted-foreground">
                {d.emailNotVerifiedHint}
              </p>
            )}
          </div>
        </div>
      </div>

      {card && <KpiRow card={card} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          {/* Staff notes (TASK-430) open the main column, above the history: the
              operator reads them while the customer is still on the phone
              (owner decision 2026-10-04 — К4 drew them at the foot). */}
          <section className="flex flex-col gap-3 rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {d.notesHeading}
            </h3>
            <UserNotesPanel userId={user.id} />
          </section>

          {card ? (
            <CustomerHistorySections card={card} />
          ) : (
            <Callout
              icon={
                <LockIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
              }
            >
              {d.cardPermissionRequired}
            </Callout>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <AccessSection user={user} displayName={name} now={now} />

          {(canManageStaff || isOwner) && (
            <section className="flex flex-col gap-3 rounded-md border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">
                {d.staffHeading}
              </h3>

              {/* TASK-396 / TASK-317: owner-only, like deletion — the email
                  change hands the account to whoever reads the new inbox. */}
              {isOwner && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setChangeEmailOpen(true)}
                  >
                    {d.changeEmailOpen}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    {d.deleteOpen}
                  </Button>

                  <ChangeUserEmailDialog
                    userId={user.id}
                    email={user.email}
                    open={changeEmailOpen}
                    onOpenChange={setChangeEmailOpen}
                  />
                  <DeleteUserDialog
                    userId={user.id}
                    email={user.email}
                    open={deleteOpen}
                    onOpenChange={setDeleteOpen}
                  />
                </>
              )}

              {/* TEMPORARY (owner decision 2026-10-05, TASK-1743): the role
                  control is back on the customer card, because «Додати
                  співробітника» cannot promote an existing customer yet (an
                  existing email answers 409). Remove it again once TASK-1059's
                  «Хто» step finds the customer by email. A promoted account
                  leaves `/api/users`, so the card would 404 on its next read —
                  send the operator to the staff card instead. */}
              {canManageStaff && (
                <>
                  {isOwner && <Separator />}
                  <UserRoleChange
                    userId={user.id}
                    currentRole={user.role}
                    targetName={name || user.email}
                    onChanged={(nextRole) => {
                      if (nextRole !== ROLE_VALUES.CUSTOMER) {
                        router.push(`/staff/${user.id}`);
                      }
                    }}
                  />
                </>
              )}
            </section>
          )}

          <section className="flex flex-col gap-3 rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {d.accountMetadata}
            </h3>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-muted-foreground">{d.metaId}</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  <span
                    title={user.id}
                    className="min-w-0 truncate font-mono text-xs text-foreground"
                  >
                    {user.id}
                  </span>
                  <CopyButton
                    value={user.id}
                    label={d.copyId}
                    copiedLabel={d.copyIdDone}
                    failedLabel={d.copyIdFailed}
                    ariaLabel={d.copyIdAria}
                  />
                </dd>
              </div>
              <MetaRow
                label={d.fieldCreated}
                value={formatDateTime(user.createdAt)}
              />
              <MetaRow
                label={d.fieldUpdated}
                value={formatDateTime(user.updatedAt)}
              />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * «Доступ до акаунта» (К4): the status in words — for every reader, it answers
 * «чому вона не може увійти?» — the switch behind `customers:write`, and the
 * sign-in lock the API reports (`lockedUntil`, `failedLoginAttempts`).
 */
function AccessSection({
  user,
  displayName,
  now,
}: {
  user: UserEntity;
  displayName: string;
  now: number;
}) {
  const lockedUntil = user.lockedUntil ? Date.parse(user.lockedUntil) : NaN;
  const isLocked = Number.isFinite(lockedUntil) && lockedUntil > now;
  const attempts = user.failedLoginAttempts ?? 0;
  const who =
    displayName === user.email ? user.email : `${displayName} (${user.email})`;

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {d.accountStatus}
      </h3>
      <p className="text-sm text-muted-foreground">
        {user.isActive ? d.accountActive : d.accountInactive}
      </p>
      <UserBanToggle
        userId={user.id}
        isActive={user.isActive}
        displayName={who}
        className="w-full"
      />
      <Separator />
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-medium text-foreground">
          {d.lockoutHeading}
        </h4>
        <p className="text-xs text-muted-foreground">{d.lockoutUnavailable}</p>
        <p
          className={
            isLocked
              ? "text-xs font-medium text-warning"
              : "text-xs text-muted-foreground"
          }
        >
          {isLocked
            ? d.lockoutLockedUntil(formatDateTime(user.lockedUntil as string))
            : d.lockoutNone}
        </p>
        {attempts > 0 && (
          <p className="text-xs text-muted-foreground">
            {d.lockoutAttempts(attempts)}
          </p>
        )}
      </div>
    </section>
  );
}

/** «Сума покупок · Замовлень · Відгуків · Останнє замовлення» (К4) — one row. */
function KpiRow({ card }: { card: UserAdminCardEntity }) {
  const reviews = card.reviews.length;
  const lastOrder = card.recentOrders[0];
  const items = [
    { label: d.cardLtv, value: formatCurrency(card.ltv) },
    { label: d.cardOrderCount, value: String(card.orderCount) },
    {
      label: d.cardReviewsCount,
      value: reviews >= CARD_REVIEWS_LIMIT ? `${reviews}+` : String(reviews),
    },
    {
      label: d.cardLastOrder,
      value: lastOrder ? formatDate(lastOrder.createdAt) : "—",
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1 bg-background p-4">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="text-xl font-semibold text-foreground tabular-nums">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Everything `customers:card` buys (TASK-252, gated in TASK-479): recent
 * orders, review text, redeemed coupons and every support message matched by
 * email. A component so the permission question is answered in ONE place.
 */
function CustomerHistorySections({ card }: { card: UserAdminCardEntity }) {
  const { user, recentOrders, reviews, redeemedCoupons } = card;
  const contactMessages = card.contactMessages;

  return (
    <>
      <section className="flex flex-col overflow-hidden rounded-md border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <h3 className="text-sm font-semibold text-foreground">
            {d.cardRecentOrders}
          </h3>
          <Link
            href={`/orders?userId=${user.id}`}
            className="rounded-xs text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {d.cardViewAllOrders}
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            {d.cardNoOrders}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{d.colOrderNumber}</TableHead>
                <TableHead>{dict.orders.colStatus}</TableHead>
                <TableHead className="text-right">
                  {dict.orders.colTotal}
                </TableHead>
                <TableHead hideOnMobile>{dict.orders.colCreated}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/orders/${order.id}`}
                      className="rounded-xs text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <OrderNumber id={order.id} />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={orderStatusBadgeVariant(order.status)}>
                      {orderStatusLabel(order.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(order.total)}
                  </TableCell>
                  <TableCell
                    hideOnMobile
                    className="text-muted-foreground tabular-nums"
                  >
                    {formatDateTime(order.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">
          {d.cardReviews}
          {reviews.length > 0 && (
            <span className="font-normal text-muted-foreground">
              {" · "}
              {reviews.length >= CARD_REVIEWS_LIMIT
                ? `${reviews.length}+`
                : reviews.length}
            </span>
          )}
        </h3>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">{d.cardNoReviews}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 text-sm font-medium text-foreground">
                    {review.productName}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      role="img"
                      aria-label={dict.reviews.ratingAria(review.rating)}
                      className="text-sm tracking-tight text-warning"
                    >
                      {"★".repeat(review.rating)}
                      <span className="text-muted-foreground">
                        {"★".repeat(Math.max(0, 5 - review.rating))}
                      </span>
                    </span>
                    {/* TASK-446: three states, from `textStatus`. */}
                    <Badge variant={reviewBadgeVariant(review.textStatus)}>
                      {reviewStatusLabel(review.textStatus)}
                    </Badge>
                  </span>
                </div>
                {review.comment && (
                  <p className="text-sm text-muted-foreground">
                    {review.comment}
                  </p>
                )}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDate(review.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-md border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">
            {d.cardCoupons}
          </h3>
          {redeemedCoupons.length === 0 ? (
            <p className="text-sm text-muted-foreground">{d.cardNoCoupons}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {redeemedCoupons.map((coupon) => (
                <li
                  key={coupon.id}
                  className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-sm font-medium text-foreground">
                      {coupon.code}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      −
                      {coupon.type === "PERCENT"
                        ? `${coupon.value}%`
                        : formatCurrency(coupon.value)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <Link
                      href={`/orders/${coupon.orderId}`}
                      className="rounded-xs text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <OrderNumber id={coupon.orderId} />
                    </Link>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(coupon.redeemedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-md border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">
            {d.cardMessages}
          </h3>
          {contactMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{d.cardNoMessages}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {contactMessages.map((message) => (
                <ContactMessageItem key={message.id} message={message} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function ContactMessageItem({
  message,
}: {
  message: CustomerCardContactMessageEntity;
}) {
  return (
    <li className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {message.topic || d.cardMessageNoTopic}
        </span>
        <Badge variant="secondary">{contactStatusLabel(message.status)}</Badge>
      </div>
      <p className="line-clamp-2 text-sm text-muted-foreground">
        {message.message}
      </p>
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatDateTime(message.createdAt)}
      </span>
    </li>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Whether this address was ever proven (TASK-430 / AD-CRM-04), on the address
 * itself in the header (К4). A TIMESTAMP, not a boolean: "verified when"
 * answers support questions that "verified: yes" cannot.
 */
function EmailVerificationBadge({ verifiedAt }: { verifiedAt: string | null }) {
  if (verifiedAt) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant="success">{d.emailVerified}</Badge>
        <span className="text-xs text-muted-foreground">
          {d.emailVerifiedAt(formatDate(verifiedAt))}
        </span>
      </span>
    );
  }

  return <Badge variant="warning">{d.emailNotVerified}</Badge>;
}
