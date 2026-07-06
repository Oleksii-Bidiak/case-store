"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserEntityRole, useUserControllerFindById } from "@/entities/user";
import { UserBanToggle } from "@/features/user-ban-toggle";
import { Badge, Separator } from "@/shared/ui";
import { dict } from "@/shared/config";
import { UserDetailSkeleton } from "./UserDetailSkeleton";

interface UserDetailViewProps {
  userId: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Admin user detail page body.
 *
 * Fetches a single user by ID and renders a two-column layout: the profile and
 * ban/unban control on the left, account metadata on the right. A missing user
 * (404) redirects to the list.
 */
export function UserDetailView({ userId }: UserDetailViewProps) {
  const router = useRouter();
  const { data, isLoading, isError, error } = useUserControllerFindById(userId);

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

  const user = data?.data;
  if (!user) {
    return null;
  }

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
        </div>

        {/* Sidebar column */}
        <div className="flex flex-col gap-6">
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
