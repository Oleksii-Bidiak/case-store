"use client";

import * as React from "react";
import { ChevronDownIcon, DownloadIcon } from "lucide-react";

import { dict } from "@/shared/config";
import { Button } from "../button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../dropdown-menu";

const r = dict.common.registry;

export type RegistryExportFormat = "csv" | "xlsx";
export type RegistryExportScope = "found" | "selected";

export interface RegistryExportRequest {
  scope: RegistryExportScope;
  format: RegistryExportFormat;
  /** Visible column ids, in the order on screen. */
  columns: string[];
  /** The selection (empty for `found`… still passed, for the caller's logs). */
  selectedIds: string[];
}

export interface ExportMenuProps {
  /** «27 замовлень» — the count of what the current filters found. */
  foundLabel: string;
  selectedIds: readonly string[];
  columns: readonly string[];
  /**
   * Only the formats this screen can actually produce. «UI now, API later»:
   * XLSX is not offered until something writes XLSX. Empty = no menu at all.
   */
  formats: readonly RegistryExportFormat[];
  onExport: (request: RegistryExportRequest) => void;
  disabled?: boolean;
  /**
   * `false` on a screen without row selection: «Лише вибрані» could never be
   * picked there, so it is not drawn. Default `true`.
   */
  selectable?: boolean;
}

/**
 * «Експорт» (OrdersProposal П5). Choosing WHAT (found / only selected) keeps
 * the menu open; choosing the FORMAT is the commit.
 */
export function ExportMenu({
  foundLabel,
  selectedIds,
  columns,
  formats,
  onExport,
  disabled = false,
  selectable = true,
}: ExportMenuProps) {
  const [scope, setScope] = React.useState<RegistryExportScope>("found");
  const hasSelection = selectedIds.length > 0;
  // A selection that went away while «Лише вибрані» was picked falls back.
  const effectiveScope: RegistryExportScope =
    scope === "selected" && !hasSelection ? "found" : scope;

  if (formats.length === 0) return null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}>
          <DownloadIcon aria-hidden="true" />
          {r.exportLabel}
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-70">
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
          {r.exportWhat}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={effectiveScope}
          onValueChange={(value) => setScope(value as RegistryExportScope)}
        >
          <DropdownMenuRadioItem
            value="found"
            onSelect={(event) => event.preventDefault()}
          >
            {r.exportFound(foundLabel)}
          </DropdownMenuRadioItem>
          {selectable ? (
            <DropdownMenuRadioItem
              value="selected"
              disabled={!hasSelection}
              onSelect={(event) => event.preventDefault()}
            >
              {r.exportSelectedOnly}
            </DropdownMenuRadioItem>
          ) : null}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {formats.map((format) => (
          <DropdownMenuItem
            key={format}
            onSelect={() =>
              onExport({
                scope: effectiveScope,
                format,
                columns: [...columns],
                selectedIds: [...selectedIds],
              })
            }
          >
            <DownloadIcon aria-hidden="true" />
            {format === "csv" ? r.exportCsv : r.exportXlsx}
          </DropdownMenuItem>
        ))}
        <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">
          {r.exportFootnote}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
