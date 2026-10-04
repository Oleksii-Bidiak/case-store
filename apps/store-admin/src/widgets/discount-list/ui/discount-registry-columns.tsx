import Link from "next/link";
import { CopyIcon } from "lucide-react";
import {
  DiscountStatusBadge,
  discountConditions,
  discountPeriod,
  discountValueLabel,
  type DiscountEntity,
} from "@/entities/discount";
import {
  Button,
  type RegistryCardParts,
  type RegistryColumn,
} from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import { dict } from "@/shared/config";

const d = dict.discounts;

/**
 * Width the default-visible columns may share at 1440: content area 1136
 * minus the «⋯» column and the box border. No checkbox column — the API has no
 * bulk endpoint for promo codes, so there is nothing to select for.
 */
export const DISCOUNT_COLUMNS_WIDTH_BUDGET = 1136 - 44 - 2;

/** Put a code on the clipboard and say whether it worked. */
export function copyDiscountCode(code: string) {
  const write = navigator.clipboard?.writeText(code);
  if (!write) {
    toast.error(d.copyFailed);
    return;
  }
  write.then(
    () => toast.success(d.codeCopied(code)),
    () => toast.error(d.copyFailed),
  );
}

/** The 32 px copy button beside the code (ПК1). */
function CopyCodeButton({ code }: { code: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={d.copyCodeAria(code)}
      data-registry-interactive=""
      className="text-muted-foreground"
      onClick={() => copyDiscountCode(code)}
    >
      <CopyIcon aria-hidden="true" />
    </Button>
  );
}

/** «41 / 100» with a thin bar when the code has a global cap. */
function Usage({ discount }: { discount: DiscountEntity }) {
  const { redeemedCount, maxRedemptions } = discount;
  const label = d.redeemedOf(redeemedCount, maxRedemptions);
  if (maxRedemptions === null || maxRedemptions <= 0) {
    return <span className="tabular-nums">{label}</span>;
  }
  const share = Math.min(1, redeemedCount / maxRedemptions);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="tabular-nums">{label}</span>
      <span
        aria-hidden="true"
        className="block h-1 w-16 overflow-hidden rounded-full bg-muted"
      >
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </span>
    </span>
  );
}

/**
 * Columns of the promo-code register (DiscountsProposal ПК1). Sortable only by
 * what `DiscountListQueryDto`'s `@IsIn` accepts — `code`, `redeemedCount`,
 * `expiresAt` (the «Період» column); `createdAt` is the default and has no
 * column of its own.
 *
 * `now` is the list query's `dataUpdatedAt`: the status badge reads the window
 * against it, so a render never reads the clock.
 */
export function buildDiscountColumns({
  now,
}: {
  now: number;
}): RegistryColumn<DiscountEntity>[] {
  return [
    {
      id: "code",
      label: d.colCode,
      locked: true,
      rowLink: true,
      sortField: "code",
      defaultWidth: 240,
      minWidth: 160,
      cell: (discount) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-mono font-medium text-foreground">
            {discount.code}
          </span>
          {discount.showOnPromoPage ? (
            <span className="truncate text-xs text-muted-foreground">
              {d.onPromoPage}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "copy",
      label: d.rowCopyCode,
      header: <span className="sr-only">{d.rowCopyCode}</span>,
      resizable: false,
      defaultWidth: 48,
      minWidth: 48,
      cell: (discount) => <CopyCodeButton code={discount.code} />,
    },
    {
      id: "value",
      label: d.colValue,
      align: "end",
      defaultWidth: 104,
      minWidth: 88,
      cell: (discount) => (
        <span className="font-medium tabular-nums text-foreground">
          {discountValueLabel(discount)}
        </span>
      ),
    },
    {
      id: "conditions",
      label: d.colConditions,
      defaultWidth: 216,
      minWidth: 140,
      cell: (discount) => (
        <span className="text-foreground">{discountConditions(discount)}</span>
      ),
    },
    {
      id: "redeemed",
      label: d.colRedeemed,
      align: "end",
      sortField: "redeemedCount",
      defaultWidth: 128,
      minWidth: 112,
      cell: (discount) => <Usage discount={discount} />,
    },
    {
      id: "period",
      label: d.colPeriod,
      sortField: "expiresAt",
      sortHint: d.sortPeriodHint,
      defaultWidth: 184,
      minWidth: 136,
      className: "tabular-nums",
      cell: (discount) => discountPeriod(discount),
    },
    {
      id: "status",
      label: d.colStatus,
      defaultWidth: 160,
      minWidth: 120,
      cell: (discount) => <DiscountStatusBadge discount={discount} now={now} />,
    },
  ];
}

/** One code below md (ПК2): code and discount, the terms, status and usage. */
export function renderDiscountCard(
  discount: DiscountEntity,
  parts: RegistryCardParts,
  now: number,
) {
  const code = (
    <span className="font-mono font-semibold text-foreground">
      {discount.code}
    </span>
  );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        {parts.href ? (
          <Link
            href={parts.href}
            className="rounded-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {code}
          </Link>
        ) : (
          code
        )}
        <span className="flex items-center gap-1">
          <span className="font-semibold tabular-nums text-foreground">
            {discountValueLabel(discount)}
          </span>
          {parts.actions}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        {`${discountConditions(discount)} · ${discountPeriod(discount)}`}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <DiscountStatusBadge discount={discount} now={now} />
        <span className="text-xs text-muted-foreground">
          {d.usedCard(
            d.redeemedOf(discount.redeemedCount, discount.maxRedemptions),
          )}
        </span>
      </span>
    </div>
  );
}
