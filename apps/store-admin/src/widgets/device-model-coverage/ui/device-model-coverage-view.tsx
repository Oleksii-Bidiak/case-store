"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLinkIcon, PlusIcon } from "lucide-react";
import {
  useAdminDeviceCompatControllerGetModelCoverage,
  type CoverageCategoryEntity,
  type DeviceModelCoverageEntity,
} from "@/entities/device";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { shortModelName } from "@/features/device-series-picker";
import { useProductBulkCompat } from "@/features/product-bulk-compat";
import { cn } from "@/shared/lib/utils";
import {
  Button,
  Callout,
  ErrorState,
  InfoHint,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { DeviceModelCoverageSkeleton } from "./device-model-coverage-skeleton";

const t = dict.deviceCoverage;
const d = dict.devices;

/** More comparison columns than this and the table stops being readable. */
const MAX_SIBLING_COLUMNS = 5;

interface Column {
  id: string;
  name: string;
  short: string;
}

/** The count of `modelId` in a category row (0 when absent). */
function countOf(category: CoverageCategoryEntity, modelId: string): number {
  return (
    category.counts.find((cell) => cell.deviceModelId === modelId)
      ?.productCount ?? 0
  );
}

/**
 * The 5 siblings with the most products, in the API's order — the columns of
 * the matrix next to the model itself.
 */
function siblingColumns(coverage: DeviceModelCoverageEntity): Column[] {
  const total = (id: string) =>
    coverage.categories.reduce(
      (sum, category) => sum + countOf(category, id),
      0,
    );
  const kept = new Set(
    [...coverage.siblings]
      .sort((a, b) => total(b.id) - total(a.id))
      .slice(0, MAX_SIBLING_COLUMNS)
      .map((sibling) => sibling.id),
  );
  return coverage.siblings
    .filter((sibling) => kept.has(sibling.id))
    .map((sibling) => ({
      id: sibling.id,
      name: sibling.name,
      short: shortModelName({
        name: sibling.name,
        series: coverage.model.series,
      }),
    }));
}

interface DeviceModelCoverageViewProps {
  modelId: string;
}

/**
 * «iPhone 15 Pro — асортимент і діри» (TASK-1955, DeviceCompat artboard 3): one
 * device model's assortment per top-level category next to the other models of
 * its series. A red zero beside a sibling's products is a hole; the hole cards
 * point at the sibling's products in that category; «Можливо, забули позначити»
 * lists products that name the model but are not linked to it, with a one-click
 * «Додати» (`devices:write`).
 *
 * Counts are products a shopper can see, rolled up like the storefront hub
 * «Все для <модель>». The mockup's «Зберегли як «мій пристрій»» card is left out:
 * saved devices live in the storefront's localStorage (TASK-1959). Its «той самий
 * блок камер» hint is left out too — the system has no physical-fit knowledge,
 * so every hole gets the same wording.
 */
export function DeviceModelCoverageView({
  modelId,
}: DeviceModelCoverageViewProps) {
  const router = useRouter();
  const { can, arePermissionsLoading } = useAuth();
  const canAddCompat = can(PERM.devicesWrite);
  const canOpenProducts = can(PERM.productsRead);
  const canBulkFromList = can(PERM.productsWrite) && canAddCompat;

  const { data, isLoading, isError, error, refetch, isFetching } =
    useAdminDeviceCompatControllerGetModelCoverage(modelId);
  const addCompat = useProductBulkCompat();

  const isNotFound = error?.response?.status === 404;
  useEffect(() => {
    if (isNotFound) router.replace("/devices/models");
  }, [isNotFound, router]);

  if (isLoading || arePermissionsLoading) {
    return <DeviceModelCoverageSkeleton />;
  }

  const coverage = data?.data;
  const back = (
    <Link
      href="/devices/models"
      className="w-fit text-sm text-muted-foreground hover:text-foreground"
    >
      {d.backToModels}
    </Link>
  );

  if (isError || !coverage) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        {isNotFound ? null : (
          <ErrorState
            variant="card"
            message={d.loadOneError}
            onRetry={() => void refetch()}
            isRetrying={isFetching}
          />
        )}
      </div>
    );
  }

  const { model, stats, categories, suspects } = coverage;
  const short = shortModelName(model);
  const columns = siblingColumns(coverage);
  const hasSiblings = coverage.siblings.length > 0;
  const max = Math.max(
    1,
    ...categories.flatMap((category) => [
      countOf(category, model.id),
      ...columns.map((column) => countOf(category, column.id)),
    ]),
  );
  const holes = hasSiblings
    ? categories.filter(
        (category) =>
          countOf(category, model.id) === 0 &&
          coverage.siblings.some(
            (sibling) => countOf(category, sibling.id) > 0,
          ),
      )
    : [];
  const subtitle = [
    model.brandName,
    model.series ? t.subtitleSeries(model.series) : null,
    model.isActive ? t.shown : t.hidden,
  ]
    .filter(Boolean)
    .join(" · ");
  const number = (value: number) => value.toLocaleString("uk-UA");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {back}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {model.name}
            </h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Owner decision 2026-10-01: only what is live on the site is linked. */}
            {model.isActive ? (
              <Button asChild variant="outline">
                <a
                  href={`${STOREFRONT_URL}/devices/${encodeURIComponent(model.slug)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLinkIcon aria-hidden="true" />
                  {t.hubLink(model.name)}
                </a>
              </Button>
            ) : null}
            {canBulkFromList ? (
              <Button asChild>
                <Link href="/products">
                  <PlusIcon aria-hidden="true" />
                  {t.addProducts}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label={t.statCompatible}
            value={number(stats.compatibleProducts)}
          />
          <Stat label={t.statInStock} value={number(stats.inStockProducts)} />
          <Stat
            label={t.statHoles}
            value={hasSiblings ? number(stats.holes) : "—"}
            bad={hasSiblings && stats.holes > 0}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t.statsNote}</p>
      </div>

      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- the mockup's 1.35fr / 1fr split, no token for a fractional grid */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section
          aria-labelledby="coverage-matrix-title"
          className="min-w-0 rounded-lg border bg-card shadow-card"
        >
          <div className="flex flex-col gap-1 p-5 pb-2">
            <h3 id="coverage-matrix-title" className="text-base font-semibold">
              {t.matrixTitle}
            </h3>
            <p className="text-sm text-muted-foreground">
              {hasSiblings ? t.matrixLead : t.matrixLeadAlone}
            </p>
          </div>
          {categories.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">
              {t.matrixEmpty}
            </p>
          ) : (
            <div className="overflow-x-auto px-2 pb-3">
              <Table className="text-pill">
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-9">{t.columnCategory}</TableHead>
                    <TableHead className="h-9 text-right">{short}</TableHead>
                    <TableHead className="h-9">
                      <span className="sr-only">{t.columnShare}</span>
                    </TableHead>
                    {columns.map((column) => (
                      <TableHead key={column.id} className="h-9 text-right">
                        {/* TASK-1978: the full model name on hover, focus AND
                            tap — an `<abbr title>` showed it on hover only.
                            The dotted underline is the abbreviation's cue. */}
                        <InfoHint
                          hint={column.name}
                          hideIcon
                          className="underline decoration-dotted underline-offset-2"
                        >
                          {column.short}
                        </InfoHint>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => {
                    const own = countOf(category, model.id);
                    const isHole = holes.includes(category);
                    return (
                      <TableRow key={category.id}>
                        <TableCell className="h-9 py-1.5">
                          {category.name}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "h-9 py-1.5 text-right tabular-nums",
                            isHole && "font-semibold text-destructive",
                          )}
                        >
                          {number(own)}
                        </TableCell>
                        <TableCell className="h-9 py-1.5">
                          <span
                            aria-hidden="true"
                            className="relative inline-block h-1.5 w-30 rounded-full bg-muted align-middle"
                          >
                            <span
                              className="absolute inset-y-0 left-0 rounded-full bg-primary"
                              style={{
                                width: `${Math.round((own / max) * 100)}%`,
                              }}
                            />
                          </span>
                        </TableCell>
                        {columns.map((column) => (
                          <TableCell
                            key={column.id}
                            className="h-9 py-1.5 text-right text-muted-foreground tabular-nums"
                          >
                            {number(countOf(category, column.id))}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          {holes.map((category) => {
            const withProducts = coverage.siblings
              .map((sibling) => ({
                sibling,
                count: countOf(category, sibling.id),
              }))
              .filter((entry) => entry.count > 0)
              .sort((a, b) => b.count - a.count);
            const [first, second] = withProducts;
            const shortOf = (name: string) =>
              shortModelName({ name, series: model.series });
            const sentence =
              t.holeFirst(first.sibling.name, first.count) +
              (second
                ? `, ${t.holeNext(shortOf(second.sibling.name), second.count)}`
                : "") +
              (withProducts.length > 2 ? "…" : ".");
            return (
              <Callout
                key={category.id}
                variant="warning"
                title={t.holeTitle(category.name)}
                actions={
                  canOpenProducts ? (
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/products?categoryId=${encodeURIComponent(category.id)}&deviceModelId=${encodeURIComponent(first.sibling.id)}`}
                      >
                        {t.holeAction}
                      </Link>
                    </Button>
                  ) : null
                }
              >
                <span className="text-pill">
                  {sentence} {t.holeHint(short)}
                </span>
              </Callout>
            );
          })}

          {suspects.length > 0 ? (
            <section
              aria-labelledby="coverage-suspects-title"
              className="rounded-lg border bg-card shadow-card"
            >
              <div className="flex flex-col gap-1 p-5 pb-2">
                <h3
                  id="coverage-suspects-title"
                  className="text-base font-semibold"
                >
                  {t.suspectsTitle}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t.suspectsLead(short)}
                </p>
              </div>
              <ul className="flex flex-col px-5 pb-3">
                {suspects.map((product) => (
                  <li
                    key={product.id}
                    className="flex items-center justify-between gap-3 border-t py-2 first:border-t-0"
                  >
                    {canOpenProducts ? (
                      <Link
                        href={`/products/${encodeURIComponent(product.id)}`}
                        className="min-w-0 text-pill leading-snug hover:underline"
                      >
                        {product.name}
                      </Link>
                    ) : (
                      <span className="min-w-0 text-pill leading-snug">
                        {product.name}
                      </span>
                    )}
                    {canAddCompat ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={addCompat.isPending}
                        aria-label={t.suspectAddAria(model.name, product.name)}
                        onClick={() =>
                          addCompat.run([product.id], {
                            mode: "add",
                            series: [],
                            deviceModelIds: [model.id],
                          })
                        }
                      >
                        <PlusIcon aria-hidden="true" />
                        {t.suspectAdd}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
      {addCompat.confirmDialog}
    </div>
  );
}

function Stat({
  label,
  value,
  bad = false,
}: {
  label: string;
  value: string;
  bad?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3.5 shadow-card">
      <small className="text-xs text-muted-foreground">{label}</small>
      <b
        className={cn(
          "mt-1 block font-display text-2xl font-semibold tabular-nums",
          bad && "text-destructive",
        )}
      >
        {value}
      </b>
    </div>
  );
}
