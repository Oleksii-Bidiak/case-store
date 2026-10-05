"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  BannerForm,
  bannerFormValuesToUpdateDto,
  type BannerFormInput,
  type BannerFormValues,
} from "@/features/banner-form";
import {
  bannerDisplayState,
  bannerWindowLines,
  duplicateBannerPayload,
  getAdminBannerControllerFindAllQueryKey,
  getAdminBannerControllerFindByIdQueryKey,
  useAdminBannerControllerCreate,
  useAdminBannerControllerDelete,
  useAdminBannerControllerFindById,
  useAdminBannerControllerUpdate,
  type BannerDisplayState,
  type BannerEntity,
} from "@/entities/banner";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { Badge, RowActionsMenu, useConfirmDialog } from "@/shared/ui";
import { dict } from "@/shared/config";
import { toKyivDateTimeLocal } from "@/shared/lib";
import { BannerFormSkeleton } from "./banner-form-skeleton";

const d = dict.banners;

const STATE_BADGE: Record<
  BannerDisplayState,
  "default" | "outline" | "secondary"
> = {
  live: "default",
  scheduled: "outline",
  ended: "secondary",
  draft: "secondary",
};

interface EditBannerViewProps {
  bannerId: string;
}

/**
 * Edit-banner body (BannersProposal БН5/БН9): the banner's own title as the
 * heading, its display state and placement · window under it, «⋯» with
 * «Дублювати» and «Видалити…», then the form. Fetches the banner by UUID to
 * pre-populate the form; a missing banner (404) redirects back to the list.
 */
export function EditBannerView({ bannerId }: EditBannerViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, dataUpdatedAt } =
    useAdminBannerControllerFindById(bannerId);
  const update = useAdminBannerControllerUpdate();
  const create = useAdminBannerControllerCreate();
  const remove = useAdminBannerControllerDelete();
  const { confirm, confirmDialog } = useConfirmDialog();
  const { can } = useAuth();
  const canWrite = can(PERM.bannersWrite);

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/banners");
    }
  }, [isNotFound, router]);

  const banner = data?.data;

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminBannerControllerFindAllQueryKey(),
    });

  const handleSubmit = (values: BannerFormValues) => {
    update.mutate(
      { id: bannerId, data: bannerFormValuesToUpdateDto(values) },
      {
        onSuccess: () => {
          void invalidateList();
          void queryClient.invalidateQueries({
            queryKey: getAdminBannerControllerFindByIdQueryKey(bannerId),
          });
          toast.success(d.toastUpdated);
          router.push("/banners");
        },
        onError: () => {
          toast.error(d.toastUpdateFailed);
        },
      },
    );
  };

  const handleDuplicate = (source: BannerEntity) => {
    create.mutate(
      { data: duplicateBannerPayload(source) },
      {
        onSuccess: (response) => {
          void invalidateList();
          toast.success(d.toastDuplicated);
          router.push(`/banners/${response.data.id}/edit`);
        },
        onError: () => toast.error(d.toastDuplicateFailed),
      },
    );
  };

  const handleDelete = async (source: BannerEntity) => {
    const confirmed = await confirm({
      title: d.deleteTitle(source.title),
      description: d.deleteDescription,
      confirmLabel: d.deleteConfirmLabel,
      destructive: true,
    });
    if (!confirmed) return;
    remove.mutate(
      { id: source.id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(d.toastDeleted);
          router.push("/banners");
        },
        onError: () => toast.error(d.toastDeleteFailed),
      },
    );
  };

  if (isLoading) return <BannerFormSkeleton />;

  const busy = update.isPending || create.isPending || remove.isPending;
  const state = banner ? bannerDisplayState(banner, dataUpdatedAt) : null;
  const windowLine = banner
    ? bannerWindowLines(banner, dataUpdatedAt).primary
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href="/banners"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {d.back}
          </Link>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {banner?.title || d.editHeading}
          </h2>
          {banner && state && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATE_BADGE[state]}>
                {d.displayStates[state]}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {[d.placements[banner.placement], windowLine]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          )}
        </div>
        {banner && canWrite && (
          <RowActionsMenu
            label={dict.common.registry.rowActionsAria(banner.title)}
            className="mt-6 size-11 border md:size-9"
            items={[
              {
                label: d.duplicate,
                onSelect: () => handleDuplicate(banner),
                disabled: busy,
              },
              {
                label: d.deleteAction,
                onSelect: () => void handleDelete(banner),
                destructive: true,
                separatorBefore: true,
                disabled: busy,
              },
            ]}
          />
        )}
      </div>

      {isError && !isNotFound ? (
        <p role="alert" className="text-sm text-destructive">
          {d.loadOneError}
        </p>
      ) : banner ? (
        <BannerForm
          id={bannerId}
          defaultValues={mapBannerToFormValues(banner)}
          onSubmit={handleSubmit}
          isPending={update.isPending}
          submitLabel={dict.common.save}
        />
      ) : null}

      {confirmDialog}
    </div>
  );
}

/** Map a fetched banner entity onto the form's string-based input shape. */
function mapBannerToFormValues(banner: BannerEntity): Partial<BannerFormInput> {
  return {
    placement: banner.placement,
    title: banner.title,
    subtitle: banner.subtitle ?? "",
    imageUrl: banner.imageUrl ?? "",
    ctaLabel: banner.ctaLabel ?? "",
    ctaHref: banner.ctaHref ?? "",
    theme: banner.theme ?? "",
    status: banner.status,
    // Seed the datetime-local input ("YYYY-MM-DDTHH:mm") from the ISO instant,
    // in KYIV time — the list next door renders the same instant through the
    // Kyiv-pinned `formatDateTime`, and a browser-zone seed made the two screens
    // disagree on any machine outside Kyiv.
    scheduledAt: banner.scheduledAt
      ? toKyivDateTimeLocal(banner.scheduledAt)
      : "",
    // TASK-429: the window END must be seeded too. Without it the field renders
    // empty on every edit and the next save — which always carries `status` —
    // would silently WIPE a live window.
    scheduledUntil: banner.scheduledUntil
      ? toKyivDateTimeLocal(banner.scheduledUntil)
      : "",
  };
}
