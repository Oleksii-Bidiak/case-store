import { useId } from "react";
import Link from "next/link";
import { InfoIcon } from "lucide-react";
import type { DeviceModelEntity } from "@/entities/device";
import {
  Badge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type RegistryCardParts,
  type RegistryColumn,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.devices;

/**
 * Width the default-visible columns may share at 1440: the content area 1136
 * minus the «⋯» column and the box border. No checkbox column — there is no
 * bulk endpoint for device models.
 */
export const DEVICE_MODEL_COLUMNS_WIDTH_BUDGET = 1136 - 44 - 2;

/** «Показується / Приховано» — the status canon (§1.6). */
export function ModelStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? "default" : "secondary"}>
      {isActive ? d.statusActive : d.statusInactive}
    </Badge>
  );
}

/** «Сторінок на сайті ⓘ» — the ⓘ is a button so the keyboard reaches it too. */
function PagesHeader() {
  const hintId = useId();
  return (
    <span className="inline-flex items-center gap-1">
      {d.colPages}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={d.colPagesHintAria}
            aria-describedby={hintId}
            data-registry-interactive=""
            className="inline-flex rounded-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <InfoIcon aria-hidden="true" className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-60">{d.colPagesHint}</TooltipContent>
      </Tooltip>
      <span id={hintId} hidden>
        {d.colPagesHint}
      </span>
    </span>
  );
}

/**
 * Columns of the model registry (DevicesProposal ПР1). `pagesOf` counts the
 * live compatibility pages (`useLiveCompatPages`); `undefined` while they load.
 *
 * Not drawn: «Товарів» per model — the list payload has no product count
 * (TASK-1082 API tail); «Сумісні товари» in «⋯» opens the filtered products.
 */
export function buildDeviceModelColumns({
  pagesOf,
}: {
  pagesOf: (model: DeviceModelEntity) => number | undefined;
}): RegistryColumn<DeviceModelEntity>[] {
  return [
    {
      id: "name",
      label: d.colModel,
      locked: true,
      rowLink: true,
      defaultWidth: 380,
      minWidth: 200,
      cell: (model) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-medium text-foreground">
            {model.name}
          </span>
          {model.series ? (
            <span className="truncate text-xs text-muted-foreground">
              {model.series}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "brand",
      label: d.colBrand,
      defaultWidth: 160,
      minWidth: 112,
      cell: (model) => model.brandName ?? "—",
    },
    {
      id: "year",
      label: d.colYear,
      defaultWidth: 96,
      minWidth: 72,
      className: "tabular-nums",
      cell: (model) =>
        model.releaseYear ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: "pages",
      label: d.colPages,
      header: <PagesHeader />,
      align: "end",
      defaultWidth: 184,
      minWidth: 128,
      className: "tabular-nums",
      cell: (model) => {
        const pages = pagesOf(model);
        return pages ? pages : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      id: "status",
      label: d.colStatus,
      defaultWidth: 160,
      minWidth: 120,
      cell: (model) => <ModelStatusBadge isActive={model.isActive} />,
    },
  ];
}

/** One model below md (ПР4): name, «бренд · серія · рік», pages and the status. */
export function renderDeviceModelCard(
  pagesOf: (model: DeviceModelEntity) => number | undefined,
) {
  return function DeviceModelCard(
    model: DeviceModelEntity,
    parts: RegistryCardParts,
  ) {
    const name = (
      <span className="truncate font-medium text-foreground">{model.name}</span>
    );
    const pages = pagesOf(model);
    const facts = [model.brandName, model.series, model.releaseYear]
      .filter((fact) => fact !== null && fact !== undefined && fact !== "")
      .join(" · ");
    return (
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {parts.href ? (
            <Link
              href={parts.href}
              className="min-w-0 truncate rounded-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {name}
            </Link>
          ) : (
            name
          )}
          {facts ? (
            <span className="text-xs text-muted-foreground">{facts}</span>
          ) : null}
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {/* Unknown (still loading, or the read failed) is not «немає». */}
            {pages === undefined ? null : (
              <span>{pages ? d.pagesCount(pages) : d.noPages}</span>
            )}
            <ModelStatusBadge isActive={model.isActive} />
          </span>
        </div>
        {parts.actions}
      </div>
    );
  };
}
