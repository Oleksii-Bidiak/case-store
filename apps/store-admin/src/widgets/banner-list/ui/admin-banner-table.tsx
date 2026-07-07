"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BannerEntityPlacement,
  getAdminBannerControllerFindAllQueryKey,
  useAdminBannerControllerFindAll,
  useAdminBannerControllerPublish,
  useAdminBannerControllerUnpublish,
  useAdminBannerControllerDelete,
  type BannerEntity,
} from "@/entities/banner";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { AdminBannerTableSkeleton } from "./admin-banner-table-skeleton";

/** Placement rendering order — mirrors the storefront top-to-bottom layout. */
const PLACEMENT_ORDER = [
  BannerEntityPlacement.ANNOUNCEMENT_BAR,
  BannerEntityPlacement.HERO_SLIDE,
  BannerEntityPlacement.PROMO_TILE,
  BannerEntityPlacement.PROMO_BANNER,
] as const;

/**
 * Narrow a raw `?placement=` value to a real placement. An unknown/absent value
 * is rejected so the render loop falls back to the full grouped view (TASK-264-C
 * deep link from the content map).
 */
function isValidPlacement(
  value: string | null,
): value is BannerEntityPlacement {
  return (
    value !== null && (PLACEMENT_ORDER as readonly string[]).includes(value)
  );
}

/**
 * Admin banners view: banners grouped by placement, each group a table of
 * title, status badge, sort order, and per-row actions (edit, publish/unpublish
 * toggle keyed on `status`, delete with confirm). Banners are low-volume content,
 * so the whole set loads at once with no search/pagination.
 */
export function AdminBannerTable() {
  const queryClient = useQueryClient();

  // Optional `?placement=` deep link (TASK-264-C): when it names a real
  // placement, only that one section renders; otherwise the full grouped view is
  // byte-for-byte unchanged. The query itself is NOT narrowed — a manager
  // arriving here still sees drafts for that placement, not just published rows.
  const searchParams = useSearchParams();
  const placementParam = searchParams.get("placement");
  const visiblePlacements: readonly BannerEntityPlacement[] = isValidPlacement(
    placementParam,
  )
    ? [placementParam]
    : PLACEMENT_ORDER;

  const { data, isLoading, isError } = useAdminBannerControllerFindAll();
  const publish = useAdminBannerControllerPublish();
  const unpublish = useAdminBannerControllerUnpublish();
  const remove = useAdminBannerControllerDelete();

  const banners = data?.data ?? [];

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminBannerControllerFindAllQueryKey(),
    });

  const handleToggle = (id: string, isPublished: boolean) => {
    const mutation = isPublished ? unpublish : publish;
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(
            isPublished
              ? dict.banners.toastUnpublished
              : dict.banners.toastPublished,
          );
        },
        onError: () => toast.error(dict.banners.toastStatusFailed),
      },
    );
  };

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(dict.banners.deleteConfirm(title))) return;
    remove.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(dict.banners.toastDeleted);
        },
        onError: () => toast.error(dict.banners.toastDeleteFailed),
      },
    );
  };

  if (isLoading) {
    return <AdminBannerTableSkeleton />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.banners.loadError}
      </p>
    );
  }

  if (banners.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {dict.banners.empty}
      </div>
    );
  }

  const isMutating =
    publish.isPending || unpublish.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-8">
      {visiblePlacements.map((placement) => {
        const group = banners.filter((b) => b.placement === placement);
        if (group.length === 0) return null;

        return (
          <section key={placement} className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-foreground">
              {dict.banners.placements[placement]}
            </h3>
            <div className="rounded-lg border border-border shadow-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{dict.banners.colTitle}</TableHead>
                    <TableHead>{dict.banners.colStatus}</TableHead>
                    <TableHead>{dict.banners.colSort}</TableHead>
                    <TableHead className="text-right">
                      {dict.common.actions}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.map((banner) => (
                    <BannerRow
                      key={banner.id}
                      banner={banner}
                      isMutating={isMutating}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface BannerRowProps {
  banner: BannerEntity;
  isMutating: boolean;
  onToggle: (id: string, isPublished: boolean) => void;
  onDelete: (id: string, title: string) => void;
}

function BannerRow({ banner, isMutating, onToggle, onDelete }: BannerRowProps) {
  const isPublished = banner.status === "PUBLISHED";

  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link href={`/banners/${banner.id}/edit`} className="hover:underline">
          {banner.title}
        </Link>
      </TableCell>
      <TableCell>
        <Badge variant={isPublished ? "default" : "secondary"}>
          {dict.banners.statusLabels[banner.status]}
        </Badge>
      </TableCell>
      <TableCell>{banner.sortOrder}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/banners/${banner.id}/edit`}>{dict.common.edit}</Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isMutating}
            onClick={() => onToggle(banner.id, isPublished)}
          >
            {isPublished ? dict.banners.unpublish : dict.banners.publish}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isMutating}
            onClick={() => onDelete(banner.id, banner.title)}
          >
            {dict.common.delete}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
