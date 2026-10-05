"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  getAddonServiceControllerAdminFindAllQueryKey,
  useAddonServiceControllerAdminFindAll,
  useAddonServiceControllerFindById,
  useAdminAddonServiceControllerSetStatus,
  type AddonServiceEntity,
} from "@/entities/addon-service";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { AddonServiceFormDialog } from "@/features/addon-service-form";
import {
  Button,
  Callout,
  DataRegistry,
  LiveAnnouncer,
  RegistryHeader,
  SummaryValue,
  pageSizeFrom,
  useConfirmDialog,
  useDataRegistry,
  type QuickView,
  type RegistryCardParts,
  type RowActionItem,
} from "@/shared/ui";
import { countLabel } from "@/shared/lib";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { dict } from "@/shared/config";
import {
  AddonServiceStatusBadge,
  addonServicePrice,
  buildAddonServiceColumns,
  firstLine,
} from "./addon-service-registry-columns";

const d = dict.addonServices;

const ALL_VIEW = "all";
const ACTIVE_OPTION = "active";
const INACTIVE_OPTION = "inactive";

const LIST_PATH = "/addon-services";

/** Which dialog a deep link (`/new`, `/[id]/edit`) opens over the list. */
export type AddonServiceDialogRequest =
  { mode: "create" } | { mode: "edit"; id: string };

interface AddonServiceTableProps {
  /** Deep link: open the form dialog on mount; closing it returns to the list. */
  dialog?: AddonServiceDialogRequest;
}

const getRowId = (service: AddonServiceEntity) => service.id;

/**
 * The add-on services registry (TASK-174; toolbar TASK-357; wave 198 —
 * AddonServicesProposal ДП1–ДП10, TASK-1083) on the shared `DataRegistry`.
 *
 * ## What moved, nothing went
 *
 * - The status select became the quick views «Усі · Показуються · Приховані» —
 *   the same `?status=active|inactive` param, so old links keep working. Their
 *   counters are the API's own `meta.total` (one-row requests); «Приховані» is
 *   the difference, exact because status is the only split.
 * - «Редагувати» and the toggle moved into «⋯»; the name opens the service.
 *   Hiding asks first (AlertDialog with its consequences); showing again does
 *   not — it takes nothing away from anyone.
 * - The form is a dialog over the list. `/addon-services/new` and
 *   `/addon-services/[id]/edit` still work: they render this list with that
 *   dialog open, and closing it returns to `/addon-services`.
 *
 * ## Pending is per row (ДП2)
 *
 * One toggle in flight used to disable every row's toggle. Each request now
 * carries its own promise (`mutateAsync`) and only its row waits.
 *
 * ## Permissions
 *
 * Every write here is `addons:write` — the API's class guard. Without it the
 * CTA and the toggles are gone and «⋯» offers «Переглянути» (the dialog,
 * read-only). Today the API guards the READS with `addons:write` too, so this
 * state is defensive until an `addons:read` key exists (API tail).
 */
export function AddonServiceTable({ dialog }: AddonServiceTableProps = {}) {
  return (
    <LiveAnnouncer>
      <AddonServiceView dialog={dialog} />
    </LiveAnnouncer>
  );
}

function AddonServiceView({ dialog }: AddonServiceTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const updateParams = useUrlParams();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canWrite = can(PERM.addonsWrite);
  const { confirm, confirmDialog } = useConfirmDialog();

  const searchParam = searchParams.get("search") ?? "";
  const statusParam = searchParams.get("status") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const isActiveFilter =
    statusParam === ACTIVE_OPTION
      ? true
      : statusParam === INACTIVE_OPTION
        ? false
        : undefined;

  const search = searchParam || undefined;
  const { data, isLoading, isFetching, isError, refetch } =
    useAddonServiceControllerAdminFindAll({
      page,
      limit: pageSize,
      search,
      isActive: isActiveFilter,
    });
  const allQuery = useAddonServiceControllerAdminFindAll({
    page: 1,
    limit: 1,
    search,
  });
  const activeQuery = useAddonServiceControllerAdminFindAll({
    page: 1,
    limit: 1,
    search,
    isActive: true,
  });

  const services = useMemo(() => data?.data ?? [], [data]);
  const total = data?.meta?.total;
  const totalPages = data?.meta?.totalPages ?? 1;
  const allTotal = allQuery.data?.meta?.total;
  const activeTotal = activeQuery.data?.meta?.total;
  const inactiveTotal =
    allTotal !== undefined && activeTotal !== undefined
      ? Math.max(0, allTotal - activeTotal)
      : undefined;

  /* ── per-row status toggle (ДП2) ─────────────────────────────────────── */

  const setStatus = useAdminAddonServiceControllerSetStatus();
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const markPending = (id: string, pending: boolean) =>
    setPendingIds((current) => {
      const next = new Set(current);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAddonServiceControllerAdminFindAllQueryKey(),
    });

  const toggle = async (service: AddonServiceEntity) => {
    markPending(service.id, true);
    try {
      await setStatus.mutateAsync({
        id: service.id,
        data: { isActive: !service.isActive },
      });
      await invalidateList();
      toast.success(service.isActive ? d.toastDeactivated : d.toastActivated);
    } catch {
      toast.error(d.toastStatusFailed);
    } finally {
      markPending(service.id, false);
    }
  };

  const handleHide = async (service: AddonServiceEntity) => {
    const confirmed = await confirm({
      title: d.hideTitle(service.name),
      description: d.hideBody,
      confirmLabel: d.deactivate,
    });
    if (confirmed) await toggle(service);
  };

  /* ── the form dialog ─────────────────────────────────────────────────── */

  const [dialogState, setDialogState] =
    useState<AddonServiceDialogRequest | null>(dialog ?? null);

  const byId = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services],
  );
  const editId = dialogState?.mode === "edit" ? dialogState.id : undefined;
  const fromList = editId ? byId.get(editId) : undefined;
  // A deep link may name a service that is not on this page — fetch it.
  const one = useAddonServiceControllerFindById(editId ?? "", {
    query: { enabled: Boolean(editId) && !fromList && !isLoading },
  });
  const editService = fromList ?? one.data?.data ?? null;
  const editMissing = Boolean(editId) && !fromList && one.isError;

  const closeDialog = () => {
    setDialogState(null);
    // A deep link's URL would reopen the dialog on refresh — leave it.
    if (dialog) router.replace(LIST_PATH);
  };

  const notifiedRef = useRef(false);
  useEffect(() => {
    if (!editMissing || notifiedRef.current) return;
    notifiedRef.current = true;
    toast.error(
      one.error?.response?.status === 404 ? d.notFound : d.loadOneError,
    );
    setDialogState(null);
    if (dialog) router.replace(LIST_PATH);
  }, [dialog, editMissing, one.error, router]);

  const openService = useCallback(
    (service: AddonServiceEntity) =>
      setDialogState({ mode: "edit", id: service.id }),
    [],
  );

  /* ── registry ────────────────────────────────────────────────────────── */

  const columns = useMemo(
    () => buildAddonServiceColumns({ pendingIds, onOpen: openService }),
    [pendingIds, openService],
  );
  const registry = useDataRegistry({
    tableId: "addon-services",
    columns,
    rows: services,
    getRowId,
  });

  const rowActions = (service: AddonServiceEntity): RowActionItem[] => {
    if (!canWrite) {
      return [
        { label: dict.common.view, onSelect: () => openService(service) },
      ];
    }
    const pending = pendingIds.has(service.id);
    return [
      { label: dict.common.edit, onSelect: () => openService(service) },
      service.isActive
        ? {
            label: d.hideFromCart,
            onSelect: () => void handleHide(service),
            disabled: pending,
          }
        : {
            label: d.activate,
            onSelect: () => void toggle(service),
            disabled: pending,
          },
    ];
  };

  const quickViews: QuickView[] = [
    { id: ALL_VIEW, label: d.viewAll, count: allTotal },
    { id: ACTIVE_OPTION, label: d.viewShown, count: activeTotal },
    { id: INACTIVE_OPTION, label: d.viewHidden, count: inactiveTotal },
  ];
  const activeView =
    statusParam === ACTIVE_OPTION || statusParam === INACTIVE_OPTION
      ? statusParam
      : ALL_VIEW;

  const clearStatus = () =>
    updateParams({ status: undefined, page: undefined });

  const emptyState =
    isActiveFilter !== undefined ? (
      <span className="flex flex-col items-center gap-3">
        <span className="font-semibold text-foreground">
          {d.emptyStatusTitle(isActiveFilter)}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={clearStatus}>
          {d.emptyReset}
        </Button>
      </span>
    ) : (
      d.empty
    );

  const renderCard = (
    service: AddonServiceEntity,
    parts: RegistryCardParts,
  ) => {
    const line = firstLine(service.description);
    return (
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => openService(service)}
              className="min-w-0 rounded-xs text-left font-medium break-words text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {service.name}
            </button>
            <span className="shrink-0 font-medium text-foreground tabular-nums">
              {addonServicePrice(service.price)}
            </span>
          </div>
          {line ? (
            <span className="line-clamp-2 text-xs text-muted-foreground">
              {line}
            </span>
          ) : null}
          <AddonServiceStatusBadge
            service={service}
            pending={pendingIds.has(service.id)}
          />
        </div>
        {parts.actions}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader
        title={d.heading}
        description={d.intro}
        actions={
          canWrite ? (
            <Button
              type="button"
              className="max-md:h-11"
              onClick={() => setDialogState({ mode: "create" })}
            >
              <PlusIcon aria-hidden="true" />
              {d.add}
            </Button>
          ) : null
        }
      />
      {canWrite ? null : <Callout variant="strip">{d.viewOnly}</Callout>}

      <DataRegistry
        registry={registry}
        title={d.heading}
        showHeader={false}
        quickViews={{
          items: quickViews,
          activeId: activeView,
          onChange: (id) =>
            updateParams({
              status: id === ALL_VIEW ? undefined : id,
              page: undefined,
            }),
        }}
        search={{
          value: searchParam,
          placeholder: d.searchPlaceholder,
          label: d.searchAria,
        }}
        columnsMenu={false}
        onRefresh={() => {
          void refetch();
          void allQuery.refetch();
          void activeQuery.refetch();
        }}
        isRefreshing={isFetching}
        summary={
          total === undefined ? null : (
            <>
              {d.summaryFound}{" "}
              <SummaryValue>{countLabel(total, d.itemForms)}</SummaryValue>
            </>
          )
        }
        itemForms={d.itemForms}
        getRowLabel={(service) => service.name}
        onRowOpen={openService}
        rowActions={rowActions}
        renderCard={renderCard}
        isLoading={isLoading}
        isError={isError}
        errorMessage={d.loadError}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        isRefetching={isFetching && !isLoading}
        emptyState={emptyState}
        searchQuery={search}
        pagination={{ page, totalPages, pageSize }}
      />

      <AddonServiceFormDialog
        open={dialogState !== null && !editMissing}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        isEdit={dialogState?.mode === "edit"}
        service={dialogState?.mode === "edit" ? editService : null}
        readOnly={!canWrite}
      />
      {confirmDialog}
    </div>
  );
}
