"use client";

import * as React from "react";
import Link from "next/link";
import { EllipsisIcon, type LucideIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Button } from "../button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../dropdown-menu";

export interface RowActionItem {
  label: string;
  /** Run on select. Give either this or `href`. */
  onSelect?: () => void;
  /** Navigate — rendered as a real link, so it can be opened in a new tab. */
  href?: string;
  /** With `href`: open in a new tab («Відкрити в новій вкладці»). */
  newTab?: boolean;
  destructive?: boolean;
  /** Draw a separator above this item — groups navigation apart from actions. */
  separatorBefore?: boolean;
  /**
   * A small caption above this item, starting a group — «Перенести в» over the
   * move targets (BannersProposal БН1). Drawn after `separatorBefore`.
   */
  groupLabel?: string;
  disabled?: boolean;
  /**
   * A leading icon (SettingsDelivery ДН-1.3, TASK-645). Decorative: the label
   * names the action. Menus without icons keep their text-only look.
   */
  icon?: LucideIcon;
}

export interface RowActionsMenuProps {
  /** Accessible name of the «⋯» trigger — names the record it acts on. */
  label: string;
  items: readonly RowActionItem[];
  /** Menu alignment against the trigger. */
  align?: "start" | "end";
  className?: string;
  /**
   * The trigger's tab stop — for a row inside a roving-tabindex grid (the
   * sortable flat lists, wave 198 «Контент»), where only the focused row's
   * controls are in the tab order. Default: the button's own.
   */
  tabIndex?: number;
}

/**
 * The «⋯» menu of a registry row (and of the bulk bar's overflow). A 32×32
 * ghost trigger, so it reads as part of the row rather than a button competing
 * with the record's own text.
 */
export function RowActionsMenu({
  label,
  items,
  align = "end",
  className,
  tabIndex,
}: RowActionsMenuProps) {
  if (items.length === 0) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          tabIndex={tabIndex}
          data-registry-interactive=""
          className={cn(
            "text-muted-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground",
            className,
          )}
        >
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-60">
        {items.map(({ icon: Icon, ...item }) => (
          <React.Fragment key={item.label}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
            {item.groupLabel ? (
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {item.groupLabel}
              </DropdownMenuLabel>
            ) : null}
            {item.href ? (
              <DropdownMenuItem
                asChild
                disabled={item.disabled}
                variant={item.destructive ? "destructive" : "default"}
              >
                <Link
                  href={item.href}
                  {...(item.newTab
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  {Icon ? <Icon aria-hidden="true" /> : null}
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={item.disabled}
                variant={item.destructive ? "destructive" : "default"}
                onSelect={() => item.onSelect?.()}
              >
                {Icon ? <Icon aria-hidden="true" /> : null}
                {item.label}
              </DropdownMenuItem>
            )}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
