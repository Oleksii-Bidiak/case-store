"use client";

import type { AddonServiceEntity } from "@/entities/addon-service";
import { Badge, type RegistryColumn } from "@/shared/ui";
import { formatCurrency } from "@/shared/lib/format";
import { dict } from "@/shared/config";

const d = dict.addonServices;

/**
 * Width budget of the default columns at 1440 (wave 198 canon): the 1136 px
 * content area minus the «⋯» column (44) and the border (2). No checkbox
 * column — the API offers no bulk action on services.
 */
export const ADDON_SERVICE_COLUMNS_WIDTH_BUDGET = 1136 - 44 - 2;

/** «499 ₴»; a free service reads «Безкоштовно» (AddonServicesProposal ДП1). */
export function addonServicePrice(price: string): string {
  return Number(price) === 0 ? d.free : formatCurrency(price);
}

/** The first line of the description — the cart shows one line, so does the list. */
export function firstLine(text: string | null | undefined): string | null {
  const line = text
    ?.split(/\r?\n/)
    .find((part) => part.trim())
    ?.trim();
  return line ? line : null;
}

/**
 * The canon status badge (§1.6): «Показується» / «Приховано». While THIS row's
 * toggle is in flight it says what is happening («Приховуємо…») — the other rows
 * stay as they are (ДП2).
 */
export function AddonServiceStatusBadge({
  service,
  pending,
}: {
  service: AddonServiceEntity;
  pending: boolean;
}) {
  if (pending) {
    return (
      <Badge variant="secondary">
        {service.isActive ? d.statusHiding : d.statusShowing}
      </Badge>
    );
  }
  return (
    <Badge variant={service.isActive ? "default" : "secondary"}>
      {service.isActive ? d.statusActive : d.statusInactive}
    </Badge>
  );
}

interface ColumnOptions {
  /** Ids whose status toggle is in flight. */
  pendingIds: ReadonlySet<string>;
  /** Open the service's dialog — the name is a button, for the keyboard. */
  onOpen: (service: AddonServiceEntity) => void;
}

/**
 * The registry columns (AddonServicesProposal ДП1). «Де пропонується» and
 * «Повернення» from the artboard are NOT here: the list payload has no
 * template/delta summary and `AddonService` has no «returns with the product»
 * field yet (TASK-949) — API tails, not decisions.
 */
export function buildAddonServiceColumns({
  pendingIds,
  onOpen,
}: ColumnOptions): RegistryColumn<AddonServiceEntity>[] {
  return [
    {
      id: "name",
      label: d.colName,
      locked: true,
      defaultWidth: 620,
      minWidth: 220,
      cell: (service) => {
        const line = firstLine(service.description);
        return (
          <span className="flex min-w-0 flex-col gap-0.5">
            <button
              type="button"
              onClick={() => onOpen(service)}
              className="w-fit max-w-full truncate rounded-xs text-left font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {service.name}
            </button>
            {line ? (
              <span className="truncate text-xs text-muted-foreground">
                {line}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      id: "price",
      label: d.colPrice,
      align: "end",
      defaultWidth: 180,
      minWidth: 110,
      cell: (service) => (
        <span className="text-foreground tabular-nums">
          {addonServicePrice(service.price)}
        </span>
      ),
    },
    {
      id: "status",
      label: d.colStatus,
      defaultWidth: 200,
      minWidth: 120,
      cell: (service) => (
        <AddonServiceStatusBadge
          service={service}
          pending={pendingIds.has(service.id)}
        />
      ),
    },
  ];
}
