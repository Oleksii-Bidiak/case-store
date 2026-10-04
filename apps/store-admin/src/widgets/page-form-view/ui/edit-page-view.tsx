"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  PageForm,
  pageFormValuesToUpdateDto,
  pageSaveConflictMessage,
  type PageFormInput,
  type PageFormValues,
} from "@/features/page-form";
import {
  getAdminPageControllerFindAllQueryKey,
  getAdminPageControllerFindByIdQueryKey,
  useAdminPageControllerDelete,
  useAdminPageControllerFindById,
  useAdminPageControllerUpdate,
  type PageEntity,
} from "@/entities/page";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import {
  AdminFormSkeleton,
  Badge,
  Button,
  RowActionsMenu,
  useConfirmDialog,
} from "@/shared/ui";
import { formatKeywords } from "@/shared/lib/seo";
import {
  dict,
  pagePreviewPath,
  pageSitePath,
  STOREFRONT_URL,
} from "@/shared/config";
import { formatDateTime, toKyivDateTimeLocal } from "@/shared/lib";

const d = dict.pages;

const KIND_LABELS: Record<PageEntity["kind"], string> = {
  LEGAL: d.kindLegal,
  INFO: d.kindInfo,
  HUB: d.kindHub,
};

interface EditPageViewProps {
  pageId: string;
}

/**
 * Edit-page body (PagesProposal СР8–СР12, wave 198).
 *
 * Header: «← Службові сторінки», the page's title, its status and kind and the
 * address it lives at; «Відкрити на сайті» for a PUBLISHED page only (owner
 * decision 2026-10-01 — draft preview is TASK-670), and «⋯» with «Видалити…».
 * Body: one sectioned form with ONE sticky «Зберегти».
 *
 * Renaming a PUBLISHED page's address asks first in an AlertDialog (TASK-285,
 * TASK-812). A missing page (404) redirects back to the list. Without
 * `pages:write` the form is read-only and the header carries no actions.
 */
export function EditPageView({ pageId }: EditPageViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canWrite = can(PERM.pagesWrite);
  const { confirm, confirmDialog } = useConfirmDialog();

  const { data, isLoading, isError, error } =
    useAdminPageControllerFindById(pageId);
  const update = useAdminPageControllerUpdate();
  const remove = useAdminPageControllerDelete();
  const { mutateAsync: updateAsync } = update;

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/pages");
    }
  }, [isNotFound, router]);

  const page = data?.data;

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: getAdminPageControllerFindAllQueryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: getAdminPageControllerFindByIdQueryKey(pageId),
    });
  };

  const handleSubmit = async (values: PageFormValues) => {
    // TASK-285: renaming a PUBLISHED page's slug kills its indexed URL — ask
    // first. A blank slug means "auto-generate" (no rename here).
    const nextSlug = values.slug?.trim();
    const wasLive = page?.status === "PUBLISHED";
    if (wasLive && page && nextSlug && nextSlug !== page.slug) {
      const confirmed = await confirm({
        title: d.slugChangeTitle,
        description: (
          <span className="flex flex-col gap-2">
            <span>
              {d.slugChangeBody(
                pagePreviewPath(page.kind, page.slug) ?? page.slug,
                pagePreviewPath(values.kind, nextSlug) ?? nextSlug,
              )}
            </span>
            <span>{d.slugChangeRedirect}</span>
          </span>
        ),
        confirmLabel: d.slugChangeAction,
      });
      if (!confirmed) return false;
    }
    try {
      await updateAsync({
        id: pageId,
        data: pageFormValuesToUpdateDto(values),
      });
    } catch (error) {
      toast.error(
        pageSaveConflictMessage(error, values.kind) ?? d.toastUpdateFailed,
      );
      return false;
    }
    invalidate();
    toast.success(d.toastUpdated);
    router.push("/pages");
    return true;
  };

  const handleDelete = async () => {
    if (!page) return;
    const confirmed = await confirm({
      title: d.deleteTitle(page.title),
      description: d.deleteBody(page.isActive),
      confirmLabel: d.deleteAction,
      destructive: true,
    });
    if (!confirmed) return;
    remove.mutate(
      { id: pageId },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminPageControllerFindAllQueryKey(),
          });
          toast.success(d.toastDeleted);
          router.push("/pages");
        },
        onError: () => toast.error(d.toastDeleteFailed),
      },
    );
  };

  const sitePath = page ? pageSitePath(page.kind, page.slug) : null;
  const siteHref =
    page?.status === "PUBLISHED" && sitePath
      ? `${STOREFRONT_URL}${sitePath}`
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/pages"
          className="w-fit text-sm text-muted-foreground hover:text-foreground"
        >
          {d.back}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {page?.title ?? d.editHeading}
            </h2>
            {page ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <PageHeaderStatus page={page} />
                <Badge variant="outline">{KIND_LABELS[page.kind]}</Badge>
                {sitePath ? (
                  siteHref ? (
                    <a
                      href={siteHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={d.openPathAria(sitePath)}
                      className="inline-flex items-center gap-1 rounded-xs font-mono text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {sitePath}
                      <ExternalLinkIcon
                        aria-hidden="true"
                        className="size-3.5"
                      />
                    </a>
                  ) : (
                    <span className="font-mono text-muted-foreground">
                      {sitePath}
                    </span>
                  )
                ) : null}
              </div>
            ) : null}
          </div>
          {page ? (
            <div className="flex items-center gap-2">
              {siteHref ? (
                <Button asChild variant="outline">
                  <a href={siteHref} target="_blank" rel="noopener noreferrer">
                    <ExternalLinkIcon aria-hidden="true" />
                    <span className="max-md:sr-only">{d.openOnSite}</span>
                  </a>
                </Button>
              ) : null}
              {canWrite ? (
                <RowActionsMenu
                  label={d.headerMenuAria}
                  className="size-9 border"
                  items={[
                    {
                      label: d.deleteItem,
                      onSelect: () => void handleDelete(),
                      destructive: true,
                      disabled: remove.isPending,
                    },
                  ]}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <AdminFormSkeleton />
      ) : isError && !isNotFound ? (
        <p role="alert" className="text-sm text-destructive">
          {d.loadOneError}
        </p>
      ) : page ? (
        <PageForm
          id={pageId}
          defaultValues={mapPageToFormValues(page)}
          onSubmit={handleSubmit}
          isPending={update.isPending}
          submitLabel={dict.common.save}
          readOnly={!canWrite}
        />
      ) : null}
      {confirmDialog}
    </div>
  );
}

/** «Опубліковано / Чернетка / Заплановано на …» — reads `status`, not `isActive`. */
function PageHeaderStatus({ page }: { page: PageEntity }) {
  if (page.status === "SCHEDULED") {
    return (
      <Badge variant="outline">
        {page.scheduledAt
          ? d.statusScheduledOn(formatDateTime(page.scheduledAt))
          : d.statusScheduled}
      </Badge>
    );
  }
  return page.status === "PUBLISHED" ? (
    <Badge>{d.statusPublished}</Badge>
  ) : (
    <Badge variant="secondary">{d.statusDraft}</Badge>
  );
}

/** Map a fetched page entity onto the form's string-based input shape. */
function mapPageToFormValues(page: PageEntity): Partial<PageFormInput> {
  return {
    title: page.title,
    slug: page.slug,
    kind: page.kind,
    content: page.content,
    excerpt: page.excerpt ?? "",
    metaTitle: page.metaTitle ?? "",
    metaDescription: page.metaDescription ?? "",
    keywords: formatKeywords(page.keywords),
    ogImage: page.ogImage ?? "",
    status: page.status,
    // Seed the datetime-local input from the ISO instant in KYIV time — the
    // zone the page list renders the same instant in (TASK-421).
    scheduledAt: page.scheduledAt ? toKyivDateTimeLocal(page.scheduledAt) : "",
  };
}
