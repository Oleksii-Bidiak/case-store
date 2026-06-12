"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  UserEntityRole,
  useUserControllerFindAll,
  type UserEntity,
} from "@/entities/user";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
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

  // Debounce the search box → URL `?search=` param.
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === searchParam) return;
    const timer = setTimeout(() => {
      updateParams({ search: trimmed || undefined, page: undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const { data, isLoading, isError } = useUserControllerFindAll({
    page,
    limit: PAGE_SIZE,
    search: searchParam || undefined,
    role: roleParam
      ? (roleParam as (typeof UserEntityRole)[keyof typeof UserEntityRole])
      : undefined,
    isActive: isActiveParam ? isActiveParam === "true" : undefined,
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
          placeholder="Search by email or name…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="w-64"
          aria-label="Search users"
        />
        <Select
          value={roleParam || ALL_OPTION}
          onValueChange={handleRoleChange}
        >
          <SelectTrigger className="w-40" aria-label="Filter by role">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>All roles</SelectItem>
            <SelectItem value={UserEntityRole.CUSTOMER}>Customer</SelectItem>
            <SelectItem value={UserEntityRole.ADMIN}>Admin</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={isActiveParam || ALL_OPTION}
          onValueChange={handleStatusChange}
        >
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>All statuses</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <AdminUserTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          Failed to load users. Please try again.
        </p>
      ) : users.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          No users match the current filters.
        </div>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                  <TableCell>{fullName(user)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        user.role === UserEntityRole.ADMIN
                          ? "default"
                          : "secondary"
                      }
                    >
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? "default" : "destructive"}>
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {dateFormatter.format(new Date(user.createdAt))}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/users/${user.id}`}>View</Link>
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
            Page {page} of {totalPages}
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
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
