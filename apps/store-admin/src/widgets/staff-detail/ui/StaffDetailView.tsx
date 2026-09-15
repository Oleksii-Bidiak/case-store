"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  actorLevel,
  levelBadgeVariant,
  levelLabel,
  staffDisplayName,
  useGetStaff,
} from "@/entities/staff";
import { ROLE_VALUES } from "@/entities/user";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { StaffPermissionsForm } from "@/features/staff-permissions";
import {
  DeleteStaffDialog,
  StaffStatusToggle,
  TransferOwnershipDialog,
} from "@/features/staff-account-actions";
import {
  UserPasswordResetDialog,
  UserRoleChange,
} from "@/features/user-account-actions";
import {
  Badge,
  Button,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/ui";
import { formatDateTime } from "@/shared/lib";
import { dict } from "@/shared/config";
import { StaffDetailSkeleton } from "./StaffDetailSkeleton";

const d = dict.staff;

interface StaffDetailViewProps {
  userId: string;
}

/**
 * One service account: what they may do, and who may change it
 * (TASK-480, plan 181 decision 3).
 *
 * ## Two tabs, and why the permission one is first
 *
 * «Права» opens by default because it is the question this section exists to
 * answer — before it, rights were edited on a different screen and were attached
 * to a ROLE. «Акаунт» carries the four doors the level rule guards together
 * (role, password, status, deletion) plus the transfer, so an operator never has
 * to hunt for "how do I switch this person off" among the permission checkboxes.
 *
 * ## The level rule is mirrored here, and only as PREDICTABILITY
 *
 * `assertMayManage` refuses any target at or above the caller's level, and
 * `assertMayAssign` refuses handing out a level at or above it. Both re-run on
 * the server for every request. What the card does with the same two numbers is
 * decide whether to render the write controls at all: a deputy admin opening
 * another deputy's card gets the read-only notice instead of four controls that
 * can only 403. The numbers are both server-supplied — `level` off the row,
 * `isOwner`/`isAdmin` off `/auth/me/permissions` — so this is a comparison, not
 * a second copy of the rule.
 *
 * ## The transfer is the one control gated on `isOwner` rather than a permission
 *
 * Everything else here is «an admin may not», which `staff:write` plus the level
 * rule expresses. Ownership transfer is «only the owner, ever» — `@OwnerOnly()`
 * on the API, checked BEFORE the admin bypass — and it is offered only when the
 * target is an active administrator, because the API refuses a manager, a
 * deactivated account and yourself with a 400.
 */
export function StaffDetailView({ userId }: StaffDetailViewProps) {
  const router = useRouter();
  const { userId: actorId, isOwner, isAdmin, can } = useAuth();

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const { data, isLoading, isError, error } = useGetStaff(userId);
  const person = data?.data;

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/staff");
    }
  }, [isNotFound, router]);

  if (isLoading) {
    return <StaffDetailSkeleton />;
  }

  if (isError && !isNotFound) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {d.loadOneError}
      </p>
    );
  }

  if (!person) {
    return null;
  }

  const myLevel = actorLevel({ isOwner, isAdmin });
  const isSelf = actorId === person.id;
  // "Manage only levels BELOW your own" — strictly-below, which is what makes
  // two deputies unable to act on each other.
  const outranksTarget = myLevel > person.level;
  const canWrite = can(PERM.staffWrite) && outranksTarget && !isSelf;
  const canTransfer =
    isOwner &&
    !isSelf &&
    person.role === ROLE_VALUES.ADMIN &&
    person.isActive &&
    !person.isOwner;

  const name = staffDisplayName(person);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/staff"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {d.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {name}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{person.email}</span>
          <Badge variant={levelBadgeVariant(person.level)}>
            {levelLabel(person.level)}
          </Badge>
          <Badge variant={person.isActive ? "default" : "destructive"}>
            {person.isActive ? dict.common.active : dict.common.inactive}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="permissions">
        <TabsList>
          <TabsTrigger value="permissions">{d.tabPermissions}</TabsTrigger>
          <TabsTrigger value="account">{d.tabAccount}</TabsTrigger>
        </TabsList>

        <TabsContent value="permissions" className="pt-4">
          <StaffPermissionsForm userId={person.id} canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="account" className="pt-4">
          <div className="flex flex-col gap-6 lg:max-w-2xl">
            <section className="flex flex-col gap-3 rounded-md border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">
                {d.accountHeading}
              </h3>

              {isSelf ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {d.accountSelf}
                </p>
              ) : !canWrite ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {d.accountReadOnly}
                </p>
              ) : null}

              {canWrite && (
                <>
                  <UserRoleChange
                    userId={person.id}
                    currentRole={person.role}
                    targetName={name}
                    onChanged={(nextRole) => {
                      // Demoted out of the register: the card they are looking
                      // at now answers 404, so send them back to the list.
                      if (nextRole === ROLE_VALUES.CUSTOMER) {
                        router.replace("/staff");
                      }
                    }}
                  />

                  <Separator />

                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {d.statusHeading}
                    </span>
                    <p className="text-sm text-muted-foreground">
                      {person.isActive ? d.statusActive : d.statusInactive}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <StaffStatusToggle
                        userId={person.id}
                        isActive={person.isActive}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPasswordOpen(true)}
                      >
                        {d.passwordResetOpen}
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteOpen(true)}
                    >
                      {d.deleteHeading}
                    </Button>
                  </div>
                </>
              )}
            </section>

            {canTransfer && (
              <section className="flex flex-col gap-3 rounded-md border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground">
                  {d.transferHeading}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {d.transferIntro}
                </p>
                <p className="text-xs text-muted-foreground">
                  {d.transferTargetHint}
                </p>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTransferOpen(true)}
                  >
                    {d.transferOpen}
                  </Button>
                </div>
              </section>
            )}

            <section className="flex flex-col gap-3 rounded-md border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">
                {dict.users.accountMetadata}
              </h3>
              <MetaField label={dict.users.fieldEmail} value={person.email} />
              <MetaField
                label={dict.users.fieldPhone}
                value={person.phone ?? "—"}
              />
              <MetaField
                label={d.colLastSeen}
                value={
                  person.lastSeenAt
                    ? formatDateTime(person.lastSeenAt)
                    : d.lastSeenNever
                }
              />
              <MetaField
                label={dict.users.fieldCreated}
                value={formatDateTime(person.createdAt)}
              />
              <MetaField
                label={dict.users.fieldUpdated}
                value={formatDateTime(person.updatedAt)}
              />
              <MetaField
                label={dict.users.fieldUserId}
                value={person.id}
                mono
              />
            </section>
          </div>
        </TabsContent>
      </Tabs>

      <UserPasswordResetDialog
        userId={person.id}
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
      <DeleteStaffDialog
        userId={person.id}
        email={person.email}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
      {canTransfer && (
        <TransferOwnershipDialog
          userId={person.id}
          targetName={`${name} (${person.email})`}
          open={transferOpen}
          onOpenChange={setTransferOpen}
        />
      )}
    </div>
  );
}

function MetaField({
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
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={`text-sm text-foreground${mono ? " break-all font-mono text-xs" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
