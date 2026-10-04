"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, PlusIcon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  getProductGroupControllerFindAllQueryKey,
  getProductGroupControllerFindByIdQueryKey,
  type ProductSiblingEntity,
} from "@/entities/product-group";
import { getProductControllerAdminFindAllQueryKey } from "@/entities/product";
// Straight from the generated client, like `features/product-bulk-group`: the
// one bulk endpoint that writes group membership.
import { useProductControllerSetGroupMany } from "@/shared/api";
import {
  Badge,
  Button,
  RowActionsMenu,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { FormSectionCard } from "@/shared/ui/form-section-card";
import { formatCurrency } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import type { PositionProblems } from "../model/group-positions";
import { AddPositionsDialog } from "./add-positions-dialog";

const g = dict.productGroups;

/** Clicks on these never open the row: they are controls with their own job. */
const INTERACTIVE = "a,button,input,[role=menuitem]";

interface GroupPositionsSectionProps {
  /** Absent while creating: a position can only join a group that exists. */
  groupId?: string;
  positions: readonly ProductSiblingEntity[];
  /** The form's CURRENT axes — one column each. */
  axes: string[];
  problems: PositionProblems;
  /** `products:write` — «Додати позицію…» and «Прибрати з групи». */
  canWrite: boolean;
}

const productHref = (position: ProductSiblingEntity) =>
  `/products/${position.id}`;

/** «Показується» · «Приховано» · «Немає в наявності» — what the shopper meets. */
function PositionStatus({ position }: { position: ProductSiblingEntity }) {
  if (!position.isActive) {
    return <Badge variant="secondary">{g.positionHidden}</Badge>;
  }
  if (position.stock <= 0) {
    return <Badge variant="outline">{g.positionOutOfStock}</Badge>;
  }
  return <Badge variant="default">{g.positionShown}</Badge>;
}

/**
 * «Позиції» of the group form (ProductGroupsProposal ГТ3–ГТ5, ГТ7): a table —
 * one column per axis, price, stock, status — with the row opening the
 * product; a list of cards below md. Problems the form found (a missing value,
 * a repeated combination) tint the row and name the cell.
 *
 * Membership is written straight away, not on «Зберегти»: «Додати позицію…»
 * and «⋯ → Прибрати з групи» call `PATCH /products/group` — the same bulk
 * endpoint (and the same `products:write`) as the product list. Photos are not
 * drawn: a position in the group payload carries no image (API tail).
 */
export function GroupPositionsSection({
  groupId,
  positions,
  axes,
  problems,
  canWrite,
}: GroupPositionsSectionProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setGroup = useProductControllerSetGroupMany();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const refresh = () => {
    if (groupId) {
      void queryClient.invalidateQueries({
        queryKey: getProductGroupControllerFindByIdQueryKey(groupId),
      });
    }
    void queryClient.invalidateQueries({
      queryKey: getProductGroupControllerFindAllQueryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: getProductControllerAdminFindAllQueryKey(),
    });
  };

  const removeFromGroup = async (position: ProductSiblingEntity) => {
    setPendingIds((current) => new Set(current).add(position.id));
    try {
      await setGroup.mutateAsync({
        data: { ids: [position.id], groupId: null },
      });
      refresh();
      toast.success(g.toastRemoved);
    } catch {
      toast.error(g.toastRemoveFailed);
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(position.id);
        return next;
      });
    }
  };

  const addToGroup = async (ids: string[]) => {
    if (!groupId) return;
    try {
      await setGroup.mutateAsync({ data: { ids, groupId } });
      refresh();
      toast.success(g.toastAdded(ids.length));
      setPickerOpen(false);
    } catch {
      toast.error(g.toastAddFailed);
    }
  };

  const openRow = (
    event: MouseEvent<HTMLElement>,
    position: ProductSiblingEntity,
  ) => {
    const row = event.currentTarget;
    const target = event.target as Element;
    if (!row.contains(target)) return;
    const control = target.closest(INTERACTIVE);
    if (control && row.contains(control)) return;
    router.push(productHref(position));
  };

  const actions = (position: ProductSiblingEntity) => [
    { label: g.openProduct, href: productHref(position) },
    ...(canWrite
      ? [
          {
            label: g.removeFromGroup,
            onSelect: () => void removeFromGroup(position),
            disabled: pendingIds.has(position.id),
            separatorBefore: true,
          },
        ]
      : []),
  ];

  const cellValue = (position: ProductSiblingEntity, axis: string) => {
    const value = String(position.attributes?.[axis] ?? "").trim();
    return value ? (
      value
    ) : (
      <span className="text-destructive">
        <span aria-hidden="true">{g.missingValue}</span>
        <span className="sr-only">{g.missingValueAria(axis)}</span>
      </span>
    );
  };

  const isProblem = (position: ProductSiblingEntity) =>
    problems.missing.has(position.id) || problems.duplicates.has(position.id);

  return (
    <FormSectionCard
      title={
        <>
          {g.positionsHeading}{" "}
          <span className="font-normal text-muted-foreground tabular-nums">
            {positions.length}
          </span>
        </>
      }
      actions={
        groupId && canWrite ? (
          <Button
            type="button"
            variant="outline"
            className="max-md:h-11"
            onClick={() => {
              setPickerKey((key) => key + 1);
              setPickerOpen(true);
            }}
          >
            <PlusIcon aria-hidden="true" />
            {g.addPositions}
          </Button>
        ) : null
      }
    >
      {positions.length === 0 ? (
        <p className="rounded-md border border-dashed px-3.5 py-3 text-xs text-muted-foreground">
          {groupId ? g.positionsEmpty : g.positionsEmptyNew}
        </p>
      ) : (
        <>
          {/* md+: the table */}
          <div className="overflow-x-auto rounded-lg border max-md:hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {axes.map((axis) => (
                    <TableHead key={axis}>{axis}</TableHead>
                  ))}
                  <TableHead className="text-right">{g.colPrice}</TableHead>
                  <TableHead className="text-right">{g.colStock}</TableHead>
                  <TableHead>{dict.productGroups.colStatus}</TableHead>
                  <TableHead className="w-20">
                    <span className="sr-only">{dict.common.actions}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((position) => (
                  <TableRow
                    key={position.id}
                    onClick={(event) => openRow(event, position)}
                    aria-label={position.name}
                    className={cn(
                      "cursor-pointer",
                      isProblem(position) && "bg-destructive/6",
                    )}
                  >
                    {axes.map((axis) => (
                      <TableCell key={axis}>
                        {cellValue(position, axis)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(position.price)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {g.stockUnits(position.stock)}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-1">
                        <PositionStatus position={position} />
                        {problems.duplicates.has(position.id) ? (
                          <span className="sr-only">{g.duplicateAria}</span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center">
                        <Link
                          href={productHref(position)}
                          aria-label={g.openProductAria(position.name)}
                          className="inline-flex size-8 items-center justify-center rounded-md text-primary outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <ExternalLinkIcon
                            aria-hidden="true"
                            className="size-4"
                          />
                        </Link>
                        <RowActionsMenu
                          label={dict.common.registry.rowActionsAria(
                            position.name,
                          )}
                          items={actions(position)}
                        />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* below md: the list */}
          <ul
            aria-label={g.positionsHeading}
            className="flex flex-col divide-y rounded-lg border md:hidden"
          >
            {positions.map((position) => (
              <li
                key={position.id}
                className={cn(
                  "flex items-start gap-2 px-3 py-2.5",
                  isProblem(position) && "bg-destructive/6",
                )}
              >
                <Link
                  href={productHref(position)}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="text-sm font-medium break-words text-foreground">
                    {axes.length > 0
                      ? axes.map((axis, index) => (
                          <span key={axis}>
                            {index > 0 ? " · " : null}
                            {cellValue(position, axis)}
                          </span>
                        ))
                      : position.name}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(position.price)} ·{" "}
                    {g.stockUnits(position.stock)}
                  </span>
                </Link>
                <PositionStatus position={position} />
                <RowActionsMenu
                  label={dict.common.registry.rowActionsAria(position.name)}
                  items={actions(position)}
                />
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted-foreground">{g.positionsHint}</p>
        </>
      )}

      {groupId && canWrite ? (
        <AddPositionsDialog
          key={pickerKey}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          groupId={groupId}
          onAdd={(ids) => void addToGroup(ids)}
          isPending={setGroup.isPending}
        />
      ) : null}
    </FormSectionCard>
  );
}
