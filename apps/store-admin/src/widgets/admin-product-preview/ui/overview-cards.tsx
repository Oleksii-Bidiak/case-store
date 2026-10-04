"use client";

import { useId, type ReactNode } from "react";
import Link from "next/link";
import { CircleCheckIcon, CircleHelpIcon, CircleXIcon } from "lucide-react";
import type { ProductEntity, ProductSiblingEntity } from "@/entities/product";
import type { ProductGroupAxisEntity } from "@/entities/product-group";
import { toAuditEntry, useGetAuditLog } from "@/entities/audit";
import { useSeoSettingsControllerGetSettings } from "@/entities/seo-settings";
import { Badge, SeoSnippetPreview, Skeleton } from "@/shared/ui";
import { cn, formatCurrency, formatDateTime } from "@/shared/lib";
import { OPERATIONAL_STALE_MS } from "@/shared/lib/query-freshness";
import {
  resolveEffectiveTitleTemplate,
  resolvePreviewSiteName,
  resolveSeoPreviewDescription,
  resolveSeoPreviewTitle,
} from "@/shared/lib/seo";
import { dict, STOREFRONT_HOST } from "@/shared/config";

const o = dict.productOverview;

/** How many log rows the overview shows; the product card has the rest. */
const HISTORY_LIMIT = 4;

/** A titled card of the right column; its title names the region. */
export function OverviewCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-base font-semibold text-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A small text link with an arrow in its label («Увімкнути →»). */
export function ArrowLink({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <Link
      href={href}
      className="shrink-0 rounded-xs text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </Link>
  );
}

export type CheckState = "ok" | "fail" | "unknown";

export interface VisibilityCheck {
  id: string;
  label: string;
  state: CheckState;
  fix?: { href: string; label: string };
}

const CHECK_ICON: Record<CheckState, typeof CircleCheckIcon> = {
  ok: CircleCheckIcon,
  fail: CircleXIcon,
  unknown: CircleHelpIcon,
};
const CHECK_TONE: Record<CheckState, string> = {
  ok: "text-success",
  fail: "text-destructive",
  unknown: "text-muted-foreground",
};

/**
 * «Видимість на сайті» (ПП1, ПП3, ПП4): the conditions of the storefront's
 * `PUBLIC_PRODUCT_WHERE`, each with its state said in text as well as drawn,
 * and a way to fix what fails. The group condition is not here: the storefront
 * does not read a group's switch yet (TASK-1031).
 */
export function VisibilityChecklist({ checks }: { checks: VisibilityCheck[] }) {
  const stateLabel: Record<CheckState, string> = {
    ok: o.visOk,
    fail: o.visFail,
    unknown: o.visUnknown,
  };
  return (
    <OverviewCard title={o.visibility}>
      <ul className="flex flex-col gap-2">
        {checks.map((check) => {
          const Icon = CHECK_ICON[check.state];
          return (
            <li
              key={check.id}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <span className="flex min-w-0 items-start gap-2 text-foreground">
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    CHECK_TONE[check.state],
                  )}
                />
                <span>
                  {check.label}
                  <span className="sr-only">{` — ${stateLabel[check.state]}`}</span>
                </span>
              </span>
              {check.fix ? (
                <ArrowLink href={check.fix.href}>{check.fix.label}</ArrowLink>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{o.visFootnote}</p>
    </OverviewCard>
  );
}

/** «Склад»: what can be sold, what is reserved, what is on the shelf. */
export function StockCard({ product }: { product: ProductEntity }) {
  const rows: Array<[string, number]> = [
    [o.stockSellable, product.stock],
    [o.stockReserved, product.reservedQty],
    [o.stockPhysical, product.physicalQty],
  ];
  return (
    <OverviewCard title={o.stock}>
      <dl className="flex flex-col gap-2 text-sm">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-3"
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold tabular-nums text-foreground">
              {value.toLocaleString("uk-UA")}
            </dd>
          </div>
        ))}
      </dl>
      {product.stock <= 0 ? (
        <Badge
          variant="outline"
          className="border-transparent bg-warning/15 text-foreground"
        >
          {o.stockOut}
        </Badge>
      ) : null}
    </OverviewCard>
  );
}

/** Plain text of the stored rich description — a snippet has no markup. */
const plainText = (html: string | null | undefined) =>
  (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * «Як у пошуку Google» with «перевизначено / автоматично з назви» — the
 * storefront's own tiers (`resolveSeo`): the product's overrides, then its
 * name and description, then the site defaults.
 */
export function SeoCard({ product }: { product: ProductEntity }) {
  const settings = useSeoSettingsControllerGetSettings().data?.data;
  const overridden = Boolean(
    product.metaTitle?.trim() || product.metaDescription?.trim(),
  );
  const title = resolveSeoPreviewTitle({
    entityTitle: product.metaTitle,
    defaultTitle: settings?.defaultMetaTitle,
    contentName: product.name,
    titleTemplate: resolveEffectiveTitleTemplate(
      settings?.titleTemplate,
      resolvePreviewSiteName(settings),
    ),
  });
  const description = resolveSeoPreviewDescription({
    entityDescription: product.metaDescription,
    defaultDescription: settings?.defaultMetaDescription,
    contentDescription: plainText(product.description),
  });
  return (
    <OverviewCard
      title={o.seo}
      action={
        <Badge variant="secondary">
          {overridden ? o.seoOverridden : o.seoAuto}
        </Badge>
      }
    >
      <SeoSnippetPreview
        compact
        title={title.text}
        titleTier={title.tier}
        description={description.text || undefined}
        descriptionTier={description.tier}
        url={`${STOREFRONT_HOST} › products › ${product.slug}`}
        rawTitleLength={product.metaTitle?.length ?? 0}
        rawDescriptionLength={product.metaDescription?.length ?? 0}
      />
    </OverviewCard>
  );
}

/** «Чорний» from the axis values, or the position's name. */
function variantLabel(
  position: ProductSiblingEntity,
  axes: readonly ProductGroupAxisEntity[],
): string {
  const attributes = (position.attributes ?? {}) as Record<string, unknown>;
  const values = axes
    .map((axis) => attributes[axis.name])
    .filter((value): value is string => typeof value === "string" && !!value);
  return values.length > 0 ? values.join(" · ") : position.name;
}

/**
 * «Група · N варіантів» (ПП1, ПП3): every position — a hidden one marked, not
 * dropped. `positions` come from the group's own record when it loaded (every
 * non-deleted position); the preview payload's list is the fallback, and it
 * holds only the live ones, so this product is added back when it is hidden.
 */
export function GroupCard({
  product,
  groupId,
  axes,
  positions,
}: {
  product: ProductEntity;
  groupId: string | null;
  axes: readonly ProductGroupAxisEntity[];
  positions: readonly ProductSiblingEntity[];
}) {
  if (!groupId) {
    return (
      <OverviewCard title={o.group}>
        <p className="text-sm text-muted-foreground">{o.groupNone}</p>
      </OverviewCard>
    );
  }
  return (
    <OverviewCard
      title={o.groupCount(positions.length)}
      action={
        <ArrowLink href={`/product-groups/${groupId}/edit`}>
          {o.groupOpen}
        </ArrowLink>
      }
    >
      <ul className="flex flex-col gap-1">
        {positions.map((position) => {
          const isThis = position.id === product.id;
          const label = variantLabel(position, axes);
          const marker = isThis
            ? position.isActive
              ? o.groupThis
              : o.groupThisHidden
            : position.isActive
              ? null
              : o.groupHidden;
          const body = (
            <>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  position.isActive
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              {marker ? (
                <span className="shrink-0 rounded-full bg-muted px-2 text-xs text-muted-foreground">
                  {marker}
                </span>
              ) : null}
              <span className="shrink-0 tabular-nums text-foreground">
                {formatCurrency(position.price)}
              </span>
            </>
          );
          return (
            <li key={position.id}>
              {isThis ? (
                <span
                  aria-current="true"
                  className="flex items-center gap-3 rounded-md bg-muted px-3 py-2 text-sm font-medium"
                >
                  {body}
                </span>
              ) : (
                <Link
                  href={`/products/preview/${position.slug}`}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </OverviewCard>
  );
}

/**
 * «Історія змін» — the last entries of the action log for this product. The
 * caller renders it only for `audit:read` (the log's own key, never granted to
 * a manager); everything on this product's id counts, whatever controller wrote
 * it (see ProductHistoryPanel on the product card, where «Уся історія →» goes).
 */
export function HistoryCard({ productId }: { productId: string }) {
  const { data, isLoading, isError } = useGetAuditLog(
    { entityId: productId, limit: HISTORY_LIMIT },
    { query: { staleTime: OPERATIONAL_STALE_MS } },
  );
  const entries = (data?.data ?? []).map(toAuditEntry);
  return (
    <OverviewCard
      title={o.history}
      action={
        <ArrowLink href={`/products/${productId}`}>{o.historyAll}</ArrowLink>
      }
    >
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {o.historyError}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{o.historyEmpty}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-0.5 text-sm">
              <span className="text-xs text-muted-foreground">
                {[
                  formatDateTime(entry.createdAt),
                  entry.actorEmail ?? dict.auditLog.systemActor,
                ].join(" · ")}
              </span>
              <span className="text-foreground">
                {entry.summary ?? entry.action}
              </span>
            </li>
          ))}
        </ol>
      )}
    </OverviewCard>
  );
}
