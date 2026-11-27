"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  getProductControllerAdminFindAllQueryKey,
  getProductControllerFindByIdQueryKey,
  productNotReadyMessage,
  useProductControllerActivate,
  useProductControllerDeactivate,
  useProductControllerPublishState,
} from "@/entities/product";
import { PublishBlocker, useProductImageControllerList } from "@/shared/api";
import { Badge, Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  buildReadinessChecks,
  canPublish,
  type ReadinessCheck,
} from "../model/readiness";

interface ProductPublishPanelProps {
  productId: string;
  isActive: boolean;
  name: string;
  categoryId: string;
  price: string;
  stock: number;
  description?: string | null;
  specCount: number;
  compatCount: number;
}

/**
 * ProductPublishPanel (TASK-361) — turns "on sale" into a deliberate act.
 *
 * Publication used to be a checkbox inside the product form, which meant a
 * brand-new product went live the instant someone pressed Save — before it had
 * a photo, a spec or a compatible device, because all three live on endpoints
 * that need a product id and therefore cannot exist until after that first
 * save. This panel replaces the checkbox: the form owns the product's FIELDS,
 * this owns its VISIBILITY, and the two are saved separately.
 *
 * It drives the existing `activate` / `deactivate` endpoints (the same pair the
 * product table's row toggle uses), so the storefront cache eviction and the
 * Meilisearch sync those already perform apply here unchanged.
 *
 * The four BLOCKING checks are the server's verdict (`publish-state`,
 * TASK-2573) — the API refuses to show an unready product on every path, so the
 * panel no longer judges them itself. The verdict is re-read whenever what it
 * depends on changes here: the image count (from the same
 * `useProductImageControllerList` query the image manager observes — TanStack
 * dedupes it) or the saved name / price / category. Refetching the publish
 * state alone, never the product detail, keeps the form's seed untouched.
 */
export function ProductPublishPanel({
  productId,
  isActive,
  name,
  categoryId,
  price,
  stock,
  description,
  specCount,
  compatCount,
}: ProductPublishPanelProps) {
  const queryClient = useQueryClient();
  const activate = useProductControllerActivate();
  const deactivate = useProductControllerDeactivate();
  const images = useProductImageControllerList(productId);
  const publishState = useProductControllerPublishState(productId);
  const refetchPublishState = publishState.refetch;

  // Re-read the verdict when an input to it changes after the first answer.
  // The image list arriving for the first time is not a change — the verdict
  // was read at mount from the same saved images.
  const imageCount = images.data ? (images.data.data?.length ?? 0) : undefined;
  const watched = useRef({ imageCount, name, price, categoryId });
  useEffect(() => {
    const before = watched.current;
    watched.current = { imageCount, name, price, categoryId };
    const changed =
      (before.imageCount !== undefined && before.imageCount !== imageCount) ||
      before.name !== name ||
      before.price !== price ||
      before.categoryId !== categoryId;
    if (changed) void refetchPublishState();
  }, [imageCount, name, price, categoryId, refetchPublishState]);

  const isPending = activate.isPending || deactivate.isPending;
  // No verdict (still loading, or the read failed) ⇒ nothing claims ready and
  // the publish button stays off: the server would decide anyway.
  const stateUnavailable = publishState.isPending || publishState.isError;
  const blockers: readonly PublishBlocker[] =
    publishState.data?.data.blockers ?? Object.values(PublishBlocker);

  const checks = buildReadinessChecks(
    { stock, description, specCount, compatCount },
    blockers,
  );
  const ready = !stateUnavailable && canPublish(checks);
  // TASK-2574: an active product under a hidden category (its own or an
  // ancestor — the server resolves which) is still off the storefront, so the
  // badge must not say «Показується». It never blocks publishing: the category
  // check is only about one being selected.
  const hiddenByCategory = publishState.data?.data.hiddenByCategory ?? null;
  const onSale = isActive && !hiddenByCategory;

  const handleToggle = () => {
    if (isPending) return;
    const mutation = isActive ? deactivate : activate;
    mutation.mutate(
      { id: productId },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getProductControllerFindByIdQueryKey(productId),
          });
          void queryClient.invalidateQueries({
            queryKey: getProductControllerAdminFindAllQueryKey(),
          });
          toast.success(
            isActive
              ? dict.productPublish.toastUnpublished
              : dict.productPublish.toastPublished,
          );
        },
        onError: (error) => {
          // TASK-2573: the server refused because the product is not ready —
          // say what is missing, and re-read the verdict the panel showed.
          const notReady = productNotReadyMessage(error);
          if (notReady) void refetchPublishState();
          toast.error(notReady ?? dict.productPublish.toastFailed);
        },
      },
    );
  };

  return (
    <section
      aria-labelledby="publish-heading"
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          id="publish-heading"
          className="text-sm font-semibold text-foreground"
        >
          {dict.productPublish.heading}
        </h3>
        <Badge variant={onSale ? "default" : "secondary"}>
          {onSale
            ? dict.productPublish.liveBadge
            : dict.productPublish.draftBadge}
        </Badge>
      </div>
      {hiddenByCategory ? (
        <p className="text-xs text-muted-foreground">
          {isActive
            ? dict.productPublish.hiddenByCategoryLive
            : dict.productPublish.hiddenByCategoryDraft}
          <Link
            href={`/categories/${hiddenByCategory.id}/edit`}
            aria-label={dict.productPublish.hiddenByCategoryLinkAria(
              hiddenByCategory.name,
            )}
            className="rounded-xs font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            «{hiddenByCategory.name}»
          </Link>
          {isActive ? dict.productPublish.hiddenByCategoryTail : null}
        </p>
      ) : null}

      {publishState.isError ? (
        <p role="alert" className="text-xs text-destructive">
          {dict.productPublish.stateLoadFailed}
        </p>
      ) : null}
      {ready || stateUnavailable ? null : (
        <p className="text-xs text-muted-foreground">
          {dict.productPublish.blockersHint}
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {checks.map((check) => (
          <ChecklistRow key={check.key} check={check} />
        ))}
      </ul>
      {ready && !isActive ? (
        <p className="text-xs text-muted-foreground">
          {dict.productPublish.readyHint}
        </p>
      ) : null}

      <Button
        type="button"
        variant={isActive ? "outline" : "default"}
        onClick={handleToggle}
        // A live product can ALWAYS be pulled down — the checklist only ever
        // gates going live, never coming back off sale. `ready` is false while
        // the server's verdict is loading or failed to load.
        disabled={isPending || (!isActive && !ready)}
        className="w-full"
      >
        {isActive ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        {isActive ? dict.productPublish.unpublish : dict.productPublish.publish}
      </Button>
      <p className="text-xs text-muted-foreground">
        {dict.productPublish.advisoryNote}
      </p>
    </section>
  );
}

function ChecklistRow({ check }: { check: ReadinessCheck }) {
  const Icon = check.done ? Check : Circle;
  const tone = check.done
    ? "text-success"
    : check.blocking
      ? "text-destructive"
      : "text-muted-foreground";

  return (
    <li
      data-testid={`publish-check-${check.key}`}
      data-done={check.done ? "true" : "false"}
      className="flex items-start gap-2 text-xs"
    >
      <Icon className={`mt-px size-3.5 shrink-0 ${tone}`} aria-hidden="true" />
      <span className={check.done ? "text-foreground" : tone}>
        {check.label}
      </span>
      {check.blocking && !check.done && (
        <span className="text-destructive">
          {dict.productPublish.requiredMark}
        </span>
      )}
    </li>
  );
}
