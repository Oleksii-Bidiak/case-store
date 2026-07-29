"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import {
  getProductControllerAdminFindAllQueryKey,
  getProductControllerFindByIdQueryKey,
  useProductControllerActivate,
  useProductControllerDeactivate,
} from "@/entities/product";
import { useProductImageControllerList } from "@/shared/api";
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
 * The image count comes from the same `useProductImageControllerList` query the
 * image manager on this page already observes — TanStack dedupes it, so the
 * checklist tracks uploads live without a second request.
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

  const isPending = activate.isPending || deactivate.isPending;

  const checks = buildReadinessChecks({
    name,
    categoryId,
    price,
    stock,
    description,
    imageCount: images.data?.data?.length ?? 0,
    specCount,
    compatCount,
  });
  const ready = canPublish(checks);

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
        onError: () => {
          toast.error(dict.productPublish.toastFailed);
        },
      },
    );
  };

  return (
    <section
      aria-labelledby="publish-heading"
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3
            id="publish-heading"
            className="text-lg font-semibold text-foreground"
          >
            {dict.productPublish.heading}
          </h3>
          <Badge
            variant={isActive ? "default" : "secondary"}
            className="self-start"
          >
            {isActive
              ? dict.productPublish.liveBadge
              : dict.productPublish.draftBadge}
          </Badge>
        </div>

        <Button
          type="button"
          variant={isActive ? "outline" : "default"}
          onClick={handleToggle}
          // A live product can ALWAYS be pulled down — the checklist only ever
          // gates going live, never coming back off sale.
          disabled={isPending || (!isActive && !ready)}
        >
          {isActive ? (
            <EyeOff className="size-4" />
          ) : (
            <Eye className="size-4" />
          )}
          {isActive
            ? dict.productPublish.unpublish
            : dict.productPublish.publish}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {ready
            ? dict.productPublish.readyHint
            : dict.productPublish.blockersHint}
        </p>
        <ul className="flex flex-col gap-1.5">
          {checks.map((check) => (
            <ChecklistRow key={check.key} check={check} />
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          {dict.productPublish.advisoryNote}
        </p>
      </div>
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
      className="flex items-center gap-2 text-sm"
    >
      <Icon className={`size-4 shrink-0 ${tone}`} aria-hidden="true" />
      <span className={check.done ? "text-foreground" : tone}>
        {check.label}
      </span>
      {check.blocking && !check.done && (
        <span className="text-xs text-destructive">
          {dict.productPublish.requiredMark}
        </span>
      )}
    </li>
  );
}
