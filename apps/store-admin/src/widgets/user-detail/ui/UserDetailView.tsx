"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  UserEntityRole,
  useGetUserAdminCard,
  type CustomerCardContactMessageEntity,
} from "@/entities/user";
import { orderStatusBadgeVariant, orderStatusLabel } from "@/entities/order";
import { UserBanToggle } from "@/features/user-ban-toggle";
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
import { formatCurrency } from "@/shared/lib";
import { dict } from "@/shared/config";
import { UserDetailSkeleton } from "./UserDetailSkeleton";

interface UserDetailViewProps {
  userId: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Ukrainian labels for the contact-message inbox status (reused from messages). */
const CONTACT_STATUS_LABELS: Record<string, string> = {
  NEW: dict.messages.statusNew,
  READ: dict.messages.statusRead,
  ARCHIVED: dict.messages.statusArchived,
};

function contactStatusLabel(status: string): string {
  return CONTACT_STATUS_LABELS[status] ?? status;
}

/**
 * Admin customer-card page body (TASK-252).
 *
 * Fetches the enriched customer card by user ID via `useGetUserAdminCard` and
 * renders a two-column layout: profile + lifetime stats + recent orders,
 * reviews, redeemed coupons and email-matched contact messages on the left,
 * account metadata + ban control on the right. A missing user (404) redirects to
 * the list.
 */
export function UserDetailView({ userId }: UserDetailViewProps) {
  const router = useRouter();
  const { data, isLoading, isError, error } = useGetUserAdminCard(userId);

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

  const card = data?.data;
  if (!card) {
    return null;
  }

  const { user, ltv, orderCount, recentOrders, reviews, redeemedCoupons } =
    card;
  const contactMessages = card.contactMessages;

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

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
                      user.role === UserEntityRole.ADMIN
                        ? "default"
                        : "secondary"
                    }
                  >
                    {user.role === UserEntityRole.ADMIN
                      ? dict.users.roleAdmin
                      : dict.users.roleCustomer}
                  </Badge>
                  <Badge variant={user.isActive ? "default" : "destructive"}>
                    {user.isActive ? dict.common.active : dict.common.inactive}
                  </Badge>
                </div>
              </div>
            </div>

            <Separator />

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailField label={dict.users.fieldEmail} value={user.email} />
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
                value={dateFormatter.format(new Date(user.createdAt))}
              />
            </dl>
          </section>

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
                        {dateFormatter.format(new Date(order.createdAt))}
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
                      <Badge variant={review.isActive ? "success" : "warning"}>
                        {review.isActive
                          ? dict.users.cardReviewApproved
                          : dict.users.cardReviewPending}
                      </Badge>
                    </div>
                    {review.comment && (
                      <p className="text-sm text-muted-foreground">
                        {review.comment}
                      </p>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {dateFormatter.format(new Date(review.createdAt))}
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
                        {dateFormatter.format(new Date(coupon.redeemedAt))}
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

          <section className="flex flex-col gap-3 rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {dict.users.accountMetadata}
            </h3>
            <DetailField label={dict.users.fieldUserId} value={user.id} mono />
            <DetailField
              label={dict.users.fieldCreated}
              value={dateFormatter.format(new Date(user.createdAt))}
            />
            <DetailField
              label={dict.users.fieldUpdated}
              value={dateFormatter.format(new Date(user.updatedAt))}
            />
          </section>
        </div>
      </div>
    </div>
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
        {dateFormatter.format(new Date(message.createdAt))}
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
}: {
  label: string;
  value: string;
  mono?: boolean;
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
      </dd>
    </div>
  );
}
