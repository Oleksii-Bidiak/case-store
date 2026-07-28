"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { useTableSort } from "@/shared/lib/use-table-sort";
import {
  ROLE_VALUES,
  UserEntityRole,
  roleLabel,
  useUserControllerFindAll,
  type UserEntity,
} from "@/entities/user";
import { useAuth } from "@/entities/session";
import { CreateUserDialog } from "@/features/user-create";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SortableColumnHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { AdminUserTableSkeleton } from "./AdminUserTableSkeleton";

const PAGE_SIZE = 20;
const ALL_OPTION = "__all__";
const SEARCH_DEBOUNCE_MS = 300;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

function fullName(user: UserEntity): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || "—";
}

/**
 * Widen the generated role union.
 *
 * `UserEntity.role` is still typed `CUSTOMER | ADMIN` because the API's
 * `@ApiProperty` predates MANAGER, yet MANAGER rows arrive over the wire today.
 * Comparing the narrow union against "MANAGER" is a compile error — and the
 * previous binary check rendered every manager as «Клієнт», which on a screen
 * about who holds which powers is the worst possible wrong answer. See
 * docs/manual-qa-pending.md §TASK-334.
 */
function roleOf(user: UserEntity): string {
  return user.role;
}

/**
 * Paginated, searchable, filterable user table for the admin panel.
 *
 * Search, role, status, and page state all live in the URL (`?search=`,
 * `?role=`, `?isActive=`, `?page=`) so the view is shareable and refresh-safe.
 * The search input is debounced before it touches the URL.
 */
export function AdminUserTable() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const searchParam = searchParams.get("search") ?? "";
  const roleParam = searchParams.get("role") ?? "";
  const isActiveParam = searchParams.get("isActive") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [searchInput, setSearchInput] = useState(searchParam);
  // Creating staff is owner-only on the API (`@OwnerOnly()` on POST /users).
  // Hiding the button for a manager keeps the panel honest; the 403 is what
  // actually stops them.
  const { isOwner } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const updateParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  // Debounce the search box → URL `?search=` param via the shared hook.
  const debouncedSearch = useDebouncedCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed === searchParam) return;
    updateParams({ search: trimmed || undefined, page: undefined });
  }, SEARCH_DEBOUNCE_MS);

  const { data, isLoading, isFetching, isError } = useUserControllerFindAll({
    page,
    limit: PAGE_SIZE,
    search: searchParam || undefined,
    role: roleParam
      ? (roleParam as (typeof UserEntityRole)[keyof typeof UserEntityRole])
      : undefined,
    isActive: isActiveParam ? isActiveParam === "true" : undefined,
    sortBy,
    sortOrder,
  });

  const users = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  const handleRoleChange = (value: string) => {
    updateParams({
      role: value === ALL_OPTION ? undefined : value,
      page: undefined,
    });
  };

  const handleStatusChange = (value: string) => {
    updateParams({
      isActive: value === ALL_OPTION ? undefined : value,
      page: undefined,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder={dict.users.searchPlaceholder}
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
            debouncedSearch(event.target.value);
          }}
          className="w-64"
          aria-label={dict.users.searchAria}
        />
        <Select
          value={roleParam || ALL_OPTION}
          onValueChange={handleRoleChange}
        >
          <SelectTrigger
            className="w-40"
            aria-label={dict.users.filterRoleAria}
          >
            <SelectValue placeholder={dict.users.allRoles} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>{dict.users.allRoles}</SelectItem>
            <SelectItem value={ROLE_VALUES.CUSTOMER}>
              {dict.users.roleCustomer}
            </SelectItem>
            {/* TASK-334: MANAGER is a real role the API returns and filters on,
                even though the generated `UserEntityRole` union still predates
                it. Without this option the owner could not list their own
                managers. */}
            <SelectItem value={ROLE_VALUES.MANAGER}>
              {dict.users.roleManager}
            </SelectItem>
            <SelectItem value={ROLE_VALUES.ADMIN}>
              {dict.users.roleAdmin}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={isActiveParam || ALL_OPTION}
          onValueChange={handleStatusChange}
        >
          <SelectTrigger
            className="w-40"
            aria-label={dict.users.filterStatusAria}
          >
            <SelectValue placeholder={dict.users.allStatuses} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>{dict.users.allStatuses}</SelectItem>
            <SelectItem value="true">{dict.common.active}</SelectItem>
            <SelectItem value="false">{dict.common.inactive}</SelectItem>
          </SelectContent>
        </Select>

        {isOwner && (
          <Button
            type="button"
            className="ml-auto"
            onClick={() => setCreateOpen(true)}
          >
            {dict.users.create}
          </Button>
        )}
      </div>

      {isOwner && (
        <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}

      {isLoading ? (
        <AdminUserTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.users.loadError}
        </p>
      ) : users.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {dict.users.empty}
        </div>
      ) : (
        <div className="relative rounded-lg border border-border shadow-card overflow-hidden">
          {isFetching && !isLoading && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/60"
            >
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <SortableColumnHeader
                  field="email"
                  label={dict.users.colEmail}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                />
                <TableHead hideOnMobile>{dict.users.colName}</TableHead>
                <TableHead>{dict.users.colRole}</TableHead>
                <TableHead>{dict.users.colStatus}</TableHead>
                <SortableColumnHeader
                  field="createdAt"
                  label={dict.users.colJoined}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                  hideOnMobile
                />
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium uppercase text-muted-foreground">
                      {user.email.charAt(0)}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell hideOnMobile>{fullName(user)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        roleOf(user) === ROLE_VALUES.ADMIN
                          ? "default"
                          : roleOf(user) === ROLE_VALUES.MANAGER
                            ? "warning"
                            : "secondary"
                      }
                    >
                      {roleLabel(roleOf(user))}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? "default" : "destructive"}>
                      {user.isActive
                        ? dict.common.active
                        : dict.common.inactive}
                    </Badge>
                  </TableCell>
                  <TableCell hideOnMobile className="text-muted-foreground">
                    {dateFormatter.format(new Date(user.createdAt))}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/users/${user.id}`}>{dict.common.view}</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && !isError && users.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {dict.common.pageOf(page, totalPages)}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() =>
                updateParams({
                  page: page - 1 <= 1 ? undefined : String(page - 1),
                })
              }
            >
              {dict.common.previous}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              {dict.common.next}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
