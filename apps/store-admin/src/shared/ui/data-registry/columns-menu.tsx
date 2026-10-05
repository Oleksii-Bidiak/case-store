"use client";

import * as React from "react";
import { Columns3Icon, GripVerticalIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { Button } from "../button";
import { Checkbox } from "../checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import { Separator } from "../separator";
import { useAnnouncer } from "../live-announcer";
import type {
  RegistryDensity,
  RegistrySettingsApi,
} from "./registry-settings-store";

const r = dict.common.registry;

export interface ColumnsMenuColumn {
  id: string;
  label: string;
  locked?: boolean;
}

export interface ColumnsMenuProps {
  /** Every declared column — the menu orders them from `settings`. */
  columns: readonly ColumnsMenuColumn[];
  settings: RegistrySettingsApi;
  className?: string;
}

/**
 * «Колонки» (OrdersProposal П3): which columns, in what order, how dense.
 *
 * A popover, not a dropdown menu — it holds checkboxes and buttons, which a
 * `role="menu"` may not. Reordering works three ways and they all end in the
 * same `moveColumn`: drag the grip, or focus the grip and press ↑/↓ (the
 * keyboard path the drag cannot offer), and the position is announced.
 */
export function ColumnsMenu({
  columns,
  settings,
  className,
}: ColumnsMenuProps) {
  const { announcePolite } = useAnnouncer();
  const byId = React.useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );
  const ordered = settings.settings.columns
    .map((setting) => {
      const column = byId.get(setting.id);
      return column ? { ...column, visible: setting.visible } : null;
    })
    .filter((column): column is ColumnsMenuColumn & { visible: boolean } =>
      Boolean(column),
    );

  const grips = React.useRef(new Map<string, HTMLButtonElement | null>());
  const [dragId, setDragId] = React.useState<string | null>(null);
  // Moving a keyed row re-inserts its DOM node, which can drop focus; put it
  // back on the moved grip after the reorder has rendered.
  const focusAfterMove = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!focusAfterMove.current) return;
    grips.current.get(focusAfterMove.current)?.focus();
    focusAfterMove.current = null;
  });

  const move = (id: string, delta: number, repeat: boolean) => {
    const index = ordered.findIndex((column) => column.id === id);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= ordered.length) return;
    settings.moveColumn(id, delta);
    focusAfterMove.current = id;
    announcePolite(
      r.columnMoved(byId.get(id)?.label ?? id, target + 1, ordered.length),
      { repeat },
    );
  };

  const densityLabelId = React.useId();
  const baseId = React.useId();
  const density = settings.settings.density;
  const densityOption = (value: RegistryDensity, label: string) => (
    <button
      type="button"
      aria-pressed={density === value}
      onClick={() => settings.setDensity(value)}
      className={cn(
        "px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        density === value && "bg-secondary text-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("max-md:hidden", className)}
        >
          <Columns3Icon aria-hidden="true" />
          {r.columns}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-75" aria-label={r.columns}>
        <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          {r.columnsCaption}
        </p>
        <ul className="flex flex-col">
          {ordered.map((column) => {
            const checkboxId = `${baseId}-column-${column.id}`;
            const name = column.locked
              ? r.columnLocked(column.label)
              : column.label;
            return (
              <li
                key={column.id}
                onDragOver={(event) => {
                  if (!dragId || dragId === column.id) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragId && dragId !== column.id) {
                    settings.moveColumnTo(dragId, column.id);
                  }
                  setDragId(null);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-1 py-0.5",
                  dragId === column.id && "bg-muted opacity-45",
                )}
              >
                <button
                  type="button"
                  ref={(node) => {
                    grips.current.set(column.id, node);
                  }}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    setDragId(column.id);
                  }}
                  onDragEnd={() => setDragId(null)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp")
                      move(column.id, -1, event.repeat);
                    else if (event.key === "ArrowDown")
                      move(column.id, 1, event.repeat);
                    else return;
                    event.preventDefault();
                  }}
                  aria-label={r.moveColumnAria(column.label)}
                  className="inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
                >
                  <GripVerticalIcon aria-hidden="true" className="size-4" />
                </button>
                <Checkbox
                  id={checkboxId}
                  checked={column.visible}
                  disabled={column.locked}
                  onCheckedChange={() => settings.toggleColumn(column.id)}
                  aria-label={name}
                />
                <label
                  htmlFor={checkboxId}
                  className="flex-1 py-1 text-sm text-foreground"
                >
                  {name}
                </label>
              </li>
            );
          })}
        </ul>
        <Separator className="my-1" />
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span id={densityLabelId} className="text-sm">
            {r.density}
          </span>
          <div
            role="group"
            aria-labelledby={densityLabelId}
            className="inline-flex overflow-hidden rounded-md border"
          >
            {densityOption("comfortable", r.densityComfortable)}
            {densityOption("compact", r.densityCompact)}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start font-normal text-muted-foreground"
          onClick={settings.resetWidths}
        >
          {r.resetWidths}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start font-normal text-muted-foreground"
          onClick={settings.resetToDefaults}
        >
          {r.resetDefaults}
        </Button>
        <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">
          {r.columnsFootnote}
        </p>
      </PopoverContent>
    </Popover>
  );
}
