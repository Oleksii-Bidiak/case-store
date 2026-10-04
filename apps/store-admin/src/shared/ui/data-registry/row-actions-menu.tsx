"use client";

import * as React from "react";
import Link from "next/link";
import { EllipsisIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Button } from "../button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  disabled?: boolean;
}

export interface RowActionsMenuProps {
  /** Accessible name of the «⋯» trigger — names the record it acts on. */
  label: string;
  items: readonly RowActionItem[];
  /** Menu alignment against the trigger. */
  align?: "start" | "end";
  className?: string;
  /**
   * The trigger's tabindex — for a sortable grid whose row controls follow the
   * row's roving tabindex (wave 198, block «Контент»). Default: focusable.
   */
  triggerTabIndex?: number;
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
  triggerTabIndex,
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
          tabIndex={triggerTabIndex}
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
        {items.map((item) => (
          <React.Fragment key={item.label}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
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
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={item.disabled}
                variant={item.destructive ? "destructive" : "default"}
                onSelect={() => item.onSelect?.()}
              >
                {item.label}
              </DropdownMenuItem>
            )}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
