"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminPageControllerFindAllQueryKey,
  useAdminPageControllerFindAll,
  useAdminPageControllerPublish,
  useAdminPageControllerUnpublish,
  useAdminPageControllerDelete,
  PageEntityKind,
} from "@/entities/page";
import {
  Badge,
  Button,
  Input,
  LiveAnnouncer,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/shared/ui";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { dict } from "@/shared/config";
import { AdminPageTableSkeleton } from "./admin-page-table-skeleton";

const PAGE_SIZE = 20;
const ALL_OPTION = "__all__";

/**
 * Kind tabs (TASK-435) — one screen now holds three different things: legal
 * documents served at `/legal/<slug>`, help pages at `/info/<slug>`, and hub
 * rows that are not pages at all (meta tags for a listing route). Mixed into one
 * list they are indistinguishable, so the tabs write `?kind=` and the badge
 * column labels each row.
 *
 * "Усі" carries the `ALL_OPTION` sentinel rather than `""`, which is not a legal
 * Radix `Tabs` value (the lesson TASK-405 learned on the order table): the
 * sentinel never reaches the URL — `handleKindChange` maps it back to "no
 * `?kind=`".
 */
const KIND_TABS: ReadonlyArray<{ value: string; label: string }> = [
  { value: ALL_OPTION, label: dict.pages.tabAll },
  { value: PageEntityKind.LEGAL, label: dict.pages.tabLegal },
  { value: PageEntityKind.INFO, label: dict.pages.tabInfo },
  { value: PageEntityKind.HUB, label: dict.pages.tabHub },
];

/**
 * Radix `Tabs.Root` value used when `?kind=` matches no tab (a hand-typed or
 * stale value): it matches no `TabsTrigger`, so no tab renders active — the
 * honest state rather than a lie about what is being listed.
 */
const CUSTOM_TAB = "__custom__";

/** Plain-UA label for a row's kind. */
const KIND_LABELS: Record<PageEntityKind, string> = {
  [PageEntityKind.LEGAL]: dict.pages.kindLegal,
  [PageEntityKind.INFO]: dict.pages.kindInfo,
  [PageEntityKind.HUB]: dict.pages.kindHub,
};

/** Narrow an arbitrary `?kind=` string to the enum before it reaches the API. */
function isPageKind(value: string): value is PageEntityKind {
  return Object.values(PageEntityKind).includes(value as PageEntityKind);
}

/**
 * Admin static-pages table: title, slug, status badge, sort order, and per-row
 * actions (edit, publish/unpublish toggle, delete with confirm).
 *
 * TASK-357 fixed a SILENT TRUNCATION: this table asked the (already paginated)
 * admin endpoint for `limit: 100` and rendered no page controls, so page 101
 * existed on the server and nowhere in the panel — no warning, no empty slot,
 * nothing to click. The server was never the problem; the missing control was.
 * Page and search now live in the URL (`?page=`, `?search=`).
 *
 * `LiveAnnouncer` wraps the view rather than sitting inside it — the toolbar
 * calls `useAnnouncer()` to confirm a refresh, and a hook called in the same
 * component that renders the provider would read the default no-op context.
 */
export function AdminPageTable() {
  return (
    <LiveAnnouncer>
      <AdminPageView />
    </LiveAnnouncer>
  );
}

function AdminPageView() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const searchParam = searchParams.get("search") ?? "";
  const kindParam = searchParams.get("kind") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [searchInput, setSearchInput] = useState(searchParam);

  const updateParams = useUrlParams();

  const { data, isLoading, isFetching, isError, refetch } =
    useAdminPageControllerFindAll({
      page,
      limit: PAGE_SIZE,
      search: searchParam || undefined,
      // An unrecognised `?kind=` would be rejected by the API's enum validation,
      // so only a real tab value is sent; anything else lists everything (and
      // no tab renders active, see CUSTOM_TAB).
      kind: isPageKind(kindParam) ? kindParam : undefined,
    });

  // The active tab is the one matching `?kind=` exactly, with an absent filter
  // standing for the "Усі" sentinel; otherwise CUSTOM_TAB → nothing highlighted.
  const currentTabValue = kindParam || ALL_OPTION;
  const activeTab = KIND_TABS.some((tab) => tab.value === currentTabValue)
    ? currentTabValue
    : CUSTOM_TAB;

  const handleKindChange = (value: string) => {
    updateParams({
      kind: value === ALL_OPTION ? undefined : value,
      page: undefined,
    });
  };
  const publish = useAdminPageControllerPublish();
  const unpublish = useAdminPageControllerUnpublish();
  const remove = useAdminPageControllerDelete();

  const pages = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  // Prefix match: the key without params covers every paged/searched variant.
  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminPageControllerFindAllQueryKey(),
    });

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateParams({ search: searchInput.trim() || undefined, page: undefined });
  };

  const handleToggle = (id: string, isActive: boolean) => {
    const mutation = isActive ? unpublish : publish;
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(
            isActive ? dict.pages.toastUnpublished : dict.pages.toastPublished,
          );
        },
        onError: () => toast.error(dict.pages.toastStatusFailed),
      },
    );
  };

  const handleDelete = (id: string, title: string, isPublished: boolean) => {
    if (!window.confirm(dict.pages.deleteConfirm(title, isPublished))) return;
    remove.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(dict.pages.toastDeleted);
        },
        onError: () => toast.error(dict.pages.toastDeleteFailed),
      },
    );
  };

  const isMutating =
    publish.isPending || unpublish.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        className="mb-0"
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        filters={
          <Tabs value={activeTab} onValueChange={handleKindChange}>
            <TabsList aria-label={dict.pages.tabsAria}>
              {KIND_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
        search={
          <form
            onSubmit={handleSearchSubmit}
            className="flex gap-2"
            role="search"
          >
            <Input
              type="search"
              placeholder={dict.pages.searchPlaceholder}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="max-w-xs"
              aria-label={dict.pages.searchAria}
            />
            <Button type="submit" variant="outline">
              {dict.common.search}
            </Button>
          </form>
        }
      />

      {isLoading ? (
        <AdminPageTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.pages.loadError}
        </p>
      ) : pages.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {searchParam
            ? dict.pages.emptyMatch(searchParam)
            : kindParam
              ? // Say WHICH kind is empty — "Сторінок ще немає" on a tab that
                // filters would read as "the whole section is empty".
                dict.pages.emptyKind
              : dict.pages.empty}
        </div>
      ) : (
        <div className="rounded-lg border border-border shadow-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dict.pages.colTitle}</TableHead>
                <TableHead>{dict.pages.colKind}</TableHead>
                <TableHead hideOnMobile>{dict.pages.colSlug}</TableHead>
                <TableHead>{dict.pages.colStatus}</TableHead>
                <TableHead hideOnMobile>{dict.pages.colSort}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* `row`, not `page` — the page NUMBER is already in scope. */}
              {pages.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/pages/${row.id}/edit`}
                      className="hover:underline"
                    >
                      {row.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{KIND_LABELS[row.kind]}</Badge>
                  </TableCell>
                  <TableCell hideOnMobile className="text-muted-foreground">
                    {row.slug}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.isActive ? "default" : "secondary"}>
                      {row.isActive
                        ? dict.pages.statusPublished
                        : dict.pages.statusDraft}
                    </Badge>
                  </TableCell>
                  <TableCell hideOnMobile>{row.sortOrder}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/pages/${row.id}/edit`}>
                          {dict.common.edit}
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isMutating}
                        onClick={() => handleToggle(row.id, row.isActive)}
                      >
                        {row.isActive
                          ? dict.pages.unpublish
                          : dict.pages.publish}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isMutating}
                        onClick={() =>
                          handleDelete(row.id, row.title, row.isActive)
                        }
                      >
                        {dict.common.delete}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && !isError && pages.length > 0 && (
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
