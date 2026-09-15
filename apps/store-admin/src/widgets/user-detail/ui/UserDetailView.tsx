"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ROLE_VALUES,
  roleLabel,
  useGetUserAdminCard,
  useUserControllerFindById,
  type CustomerCardContactMessageEntity,
  type UserAdminCardEntity,
} from "@/entities/user";
import { orderStatusBadgeVariant, orderStatusLabel } from "@/entities/order";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { UserBanToggle } from "@/features/user-ban-toggle";
// Imported from the slice, not the `@/features` barrel: the barrel is one file
// every parallel branch appends to, and this widget needs nothing else from it.
import { UserNotesPanel } from "@/features/user-notes";
import {
  DeleteUserDialog,
  UserRoleChange,
} from "@/features/user-account-actions";
import {
  Badge,
  Button,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { formatCurrency, formatDate, formatDateTime } from "@/shared/lib";
import { dict } from "@/shared/config";
import { UserDetailSkeleton } from "./UserDetailSkeleton";

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
 * Ukrainian labels for a review text's moderation verdict (TASK-446).
 *
 * Three values, not two. The previous badge was driven by `isActive`, a boolean
 * the backend dropped when rejecting stopped being a delete: a refused review
 * used to cease to exist, so «прочитали й відхилили» had no representation and
 * did not need one. Now the row survives its own rejection and the card has to
 * distinguish it from a review nobody has looked at yet.
 */
const REVIEW_STATUS_LABELS: Record<string, string> = {
  PENDING: dict.users.cardReviewPending,
  APPROVED: dict.users.cardReviewApproved,
  REJECTED: dict.users.cardReviewRejected,
};

function reviewStatusLabel(status: string): string {
  return REVIEW_STATUS_LABELS[status] ?? status;
}

function reviewBadgeVariant(
  status: string,
): "success" | "warning" | "destructive" {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "destructive";
  return "warning";
}

/**
 * Admin customer-card page body (TASK-252).
 *
 * Fetches the enriched customer card by user ID via `useGetUserAdminCard` and
 * renders a two-column layout: profile + staff notes + lifetime stats + recent
 * orders, reviews, redeemed coupons and email-matched contact messages on the left,
 * account metadata + ban control on the right. A missing user (404) redirects to
 * the list.
 *
 * TASK-430 added two things an operator was missing here: whether the email address
 * was ever confirmed (on the email field itself — see `EmailVerification`), and the
 * staff-notes journal (`UserNotesPanel`, a section rather than a tab — see the
 * comment at its call site).
 *
 * TWO READS SINCE TASK-479, AND WHICH ONE RUNS IS A PERMISSION QUESTION. The card
 * endpoint moved behind `customers:card`; the list and the plain profile stayed
 * under `customers:read`. So an order operator holding only the latter gets the
 * profile read — name, email, phone, the notes journal, the ban control — and one
 * line where the purchase history would be. The card request is not merely
 * hidden, it is never SENT: a request that can only answer 403 arrives here as
 * the red «Не вдалося завантажити користувача» banner, which tells the operator
 * the screen is broken when the truth is that this part was never granted to
 * them. Two different problems with two different fixes, and nothing on screen
 * would distinguish them.
 */
export function UserDetailView({ userId }: UserDetailViewProps) {
  const router = useRouter();
  const { isOwner, can } = useAuth();
  const canReadCard = can(PERM.customersCard);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
        {dict.users.loadOneError}
      </p>
    );
  }

  if (!user) {
    return null;
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  // Widened deliberately: the generated `UserEntity.role` union is still
  // `CUSTOMER | ADMIN` because the API's `@ApiProperty` predates MANAGER, but
  // MANAGER values arrive over the wire today. Comparing the narrow union
  // against "MANAGER" is a compile error AND, worse, would render every manager
  // as «Клієнт». See docs/manual-qa-pending.md §TASK-334.
  const role: string = user.role;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/users"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.users.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {user.email}
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="flex flex-col gap-4 rounded-md border border-border p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl font-semibold uppercase text-muted-foreground">
                {user.email.charAt(0)}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-lg font-semibold text-foreground">
                  {name || "—"}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      role === ROLE_VALUES.ADMIN
                        ? "default"
                        : role === ROLE_VALUES.MANAGER
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {roleLabel(role)}
                  </Badge>
                  <Badge variant={user.isActive ? "default" : "destructive"}>
                    {user.isActive ? dict.common.active : dict.common.inactive}
                  </Badge>
                </div>
              </div>
            </div>

            <Separator />

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* TASK-430 / AD-CRM-04 — the confirmation badge sits ON the email
                  field, not in the «Метадані акаунта» card in the sidebar. The
                  question it answers is «чому цей клієнт не отримує наших листів?»,
                  which is asked about the address; putting the answer next to the
                  ids and timestamps would file it where nobody looks during a
                  support call — and that card is below the staff panel, off-screen
                  on a laptop. */}
              <DetailField label={dict.users.fieldEmail} value={user.email}>
                <EmailVerification verifiedAt={user.emailVerifiedAt} />
              </DetailField>
              <DetailField
                label={dict.users.fieldFullName}
                value={name || "—"}
              />
              <DetailField
                label={dict.users.fieldPhone}
                value={user.phone ?? "—"}
              />
              <DetailField
                label={dict.users.fieldMemberSince}
                value={formatDateTime(user.createdAt)}
              />
            </dl>
          </section>

          {/* Staff notes (TASK-430).
              A SECTION, not a tab. A tab strip would hide the notes behind a click
              on the one screen an operator opens in order to read them — and this
              card has no second tab to pair it with: every other block here
              (orders, reviews, coupons, messages) is a section, so one tab strip
              would either wrap all of them (a re-layout of a page three other
              waves are touching) or stand alone as a strip of one.
              Placed directly under the profile, above the lifetime stats: «що ми
              знаємо про цю людину» is what the operator needs while the customer is
              still on the phone, and six blocks of scrolling is how a journal stops
              being read. */}
          <section className="flex flex-col gap-3 rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {dict.users.notesHeading}
            </h3>
            <UserNotesPanel userId={user.id} />
          </section>

          {/* The history the card pays for (TASK-252), behind `customers:card`
              since TASK-479. Rendered only when the fetch actually ran — see the
              docblock above for why the request is skipped rather than allowed to
              403 into an error banner. */}
          {card ? (
            <CustomerHistorySections card={card} />
          ) : (
            <section className="flex flex-col gap-3 rounded-md border border-border p-4">
              <p className="text-sm text-muted-foreground">
                {dict.users.cardPermissionRequired}
              </p>
            </section>
          )}
        </div>

        {/* Sidebar column */}
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2 rounded-md border border-border p-4">
            <span className="text-sm font-medium text-foreground">
              {dict.users.accountStatus}
            </span>
            <p className="text-sm text-muted-foreground">
              {user.isActive
                ? dict.users.accountActive
                : dict.users.accountInactive}
            </p>
            <div>
              <UserBanToggle userId={user.id} isActive={user.isActive} />
            </div>
          </section>

          {/* Staff management (TASK-317). Every action here is `@OwnerOnly()` on
              the API, so the whole panel is hidden for a manager — who would
              otherwise be offered a role selector that answers 403. */}
          {isOwner && (
            <section className="flex flex-col gap-4 rounded-md border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">
                {dict.users.staffHeading}
              </h3>

              <UserRoleChange userId={user.id} currentRole={role} />

              {/* The «Права видаються ролі…» hint and its link to
                  /settings/permissions stood here until TASK-475. Both were
                  answers to a question that no longer has this shape: rights now
                  belong to the PERSON, and the screen they pointed at is gone
                  with the role matrix. The per-person «Права» tab arrives with
                  /staff (TASK-480); leaving the old copy in the meantime would
                  send the owner to a 404 to do something that is no longer true.
                  See TASK-476/480 for the rest of this panel. */}

              <Separator />

              {/* Lockout visibility (plan 164 / TASK-317) is NOT implemented:
                  `lockedUntil` and `failedLoginAttempts` exist on the User model
                  but no endpoint exposes them, and store-api is out of this
                  branch's scope. Rather than silently drop the requirement, the
                  screen states the gap and points at the one action that does
                  clear a lockout. See docs/manual-qa-pending.md §TASK-334. */}
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">
                  {dict.users.lockoutHeading}
                </span>
                <p className="text-xs text-muted-foreground">
                  {dict.users.lockoutUnavailable}
                </p>
              </div>

              <Separator />

              {/* «Скинути пароль» stood here until TASK-476 and is not a button
                  any more, for the same reason the permissions link stopped being
                  one: the route it called moved to `/api/admin/staff/:id/password`,
                  which answers 404 for a CUSTOMER — and this screen only ever shows
                  customers now. A control whose one outcome is «не знайдено» is
                  worse than no control. The dialog component survives, repointed,
                  and mounts on the staff card in TASK-480 where the target IS
                  staff. A shopper who cannot sign in uses the self-service reset,
                  which is the only path that proves they own the address. */}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                >
                  {dict.users.deleteHeading}
                </Button>
              </div>

              <DeleteUserDialog
                userId={user.id}
                email={user.email}
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
              />
            </section>
          )}

          <section className="flex flex-col gap-3 rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {dict.users.accountMetadata}
            </h3>
            <DetailField label={dict.users.fieldUserId} value={user.id} mono />
            <DetailField
              label={dict.users.fieldCreated}
              value={formatDateTime(user.createdAt)}
            />
            <DetailField
              label={dict.users.fieldUpdated}
              value={formatDateTime(user.updatedAt)}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * Everything `customers:card` buys (TASK-252, gated in TASK-479): lifetime value,
 * recent orders with their totals, review text, redeemed coupons and the text of
 * every support message matched by email.
 *
 * A component rather than a block inside the page body, so the permission
 * question is answered in ONE place — `{card ? <this /> : <one honest line />}` —
 * instead of five `&&`s that a sixth section could quietly be added next to.
 */
function CustomerHistorySections({ card }: { card: UserAdminCardEntity }) {
  const { user, ltv, orderCount, recentOrders, reviews, redeemedCoupons } =
    card;
  const contactMessages = card.contactMessages;

  return (
    <>
      {/* Lifetime stats (TASK-252) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCell label={dict.users.cardLtv} value={formatCurrency(ltv)} />
        <StatCell
          label={dict.users.cardOrderCount}
          value={String(orderCount)}
        />
      </section>

      {/* Recent orders (TASK-252) */}
      <section className="flex flex-col gap-3 rounded-md border border-border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {dict.users.cardRecentOrders}
          </h3>
          <Link
            href={`/orders?userId=${user.id}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {dict.users.cardViewAllOrders}
          </Link>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{dict.orders.colOrder}</TableHead>
              <TableHead>{dict.orders.colStatus}</TableHead>
              <TableHead>{dict.orders.colTotal}</TableHead>
              <TableHead>{dict.orders.colCreated}</TableHead>
              <TableHead className="text-right">
                {dict.common.actions}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentOrders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  {dict.users.cardNoOrders}
                </TableCell>
              </TableRow>
            ) : (
              recentOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-xs">
                    {order.id.slice(0, 8)}…
                  </TableCell>
                  <TableCell>
                    <Badge variant={orderStatusBadgeVariant(order.status)}>
                      {orderStatusLabel(order.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatCurrency(order.total)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(order.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/orders/${order.id}`}>
                        {dict.common.view}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      {/* Reviews (TASK-252) */}
      <section className="flex flex-col gap-3 rounded-md border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">
          {dict.users.cardReviews}
        </h3>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {dict.users.cardNoReviews}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {review.productName}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {review.rating}/5
                  </span>
                  {/* TASK-446: three states, from `textStatus`. The badge
                        used to read `isActive`, a field the backend dropped
                        when REJECTED stopped meaning "deleted" — so it saw
                        `undefined` and labelled every review «На модерації»,
                        including the ones a moderator had already read and
                        published, and the ones they had read and refused. */}
                  <Badge variant={reviewBadgeVariant(review.textStatus)}>
                    {reviewStatusLabel(review.textStatus)}
                  </Badge>
                </div>
                {review.comment && (
                  <p className="text-sm text-muted-foreground">
                    {review.comment}
                  </p>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(review.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Redeemed coupons (TASK-252) */}
      <section className="flex flex-col gap-3 rounded-md border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">
          {dict.users.cardCoupons}
        </h3>
        {redeemedCoupons.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {dict.users.cardNoCoupons}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {redeemedCoupons.map((coupon) => (
              <li
                key={coupon.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-sm font-medium text-foreground">
                    {coupon.code}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {coupon.type === "PERCENT"
                      ? `${coupon.value}%`
                      : formatCurrency(coupon.value)}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <Link
                    href={`/orders/${coupon.orderId}`}
                    className="font-mono text-xs text-muted-foreground hover:text-foreground"
                  >
                    {coupon.orderId.slice(0, 8)}…
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(coupon.redeemedAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Contact messages (TASK-252) */}
      <section className="flex flex-col gap-3 rounded-md border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">
          {dict.users.cardMessages}
        </h3>
        {contactMessages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {dict.users.cardNoMessages}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {contactMessages.map((message) => (
              <ContactMessageItem key={message.id} message={message} />
            ))}
          </ul>
        )}
      </section>
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
          {message.topic || dict.users.cardMessageNoTopic}
        </span>
        <span className="text-xs text-muted-foreground">
          {contactStatusLabel(message.status)}
        </span>
      </div>
      <p className="line-clamp-2 text-sm text-muted-foreground">
        {message.message}
      </p>
      <span className="text-xs text-muted-foreground">
        {formatDateTime(message.createdAt)}
      </span>
    </li>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-4">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-2xl font-semibold text-foreground">{value}</span>
    </div>
  );
}

function DetailField({
  label,
  value,
  mono = false,
  children,
}: {
  label: string;
  value: string;
  mono?: boolean;
  /** Rendered inside the `<dd>`, under the value — a badge or a hint. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`text-sm text-foreground${mono ? " break-all font-mono text-xs" : ""}`}
      >
        {value}
        {children}
      </dd>
    </div>
  );
}

/**
 * Whether this address was ever proven (TASK-430 / AD-CRM-04).
 *
 * `emailVerifiedAt` has been on the wire since TASK-342 and the panel showed
 * nothing at all, so the one fact behind "the customer says they get no emails from
 * us" was invisible to the person taking the call.
 *
 * A TIMESTAMP, not a boolean, and the date is shown: "verified when" answers support
 * questions that "verified: yes" cannot. And the null case is stated honestly —
 * every account created before verification existed is null too, so it means "we do
 * not know", not "they refused". Saying that in the hint is the difference between a
 * useful field and one that starts arguments with customers.
 */
function EmailVerification({ verifiedAt }: { verifiedAt: string | null }) {
  if (verifiedAt) {
    return (
      <span className="mt-1 flex flex-wrap items-center gap-2">
        <Badge variant="success">{dict.users.emailVerified}</Badge>
        <span className="text-xs text-muted-foreground">
          {dict.users.emailVerifiedAt(formatDate(verifiedAt))}
        </span>
      </span>
    );
  }

  return (
    <span className="mt-1 flex flex-col gap-1">
      <Badge variant="warning" className="w-fit">
        {dict.users.emailNotVerified}
      </Badge>
      <span className="text-xs text-muted-foreground">
        {dict.users.emailNotVerifiedHint}
      </span>
    </span>
  );
}
