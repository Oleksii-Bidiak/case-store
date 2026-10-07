"use client";

import * as React from "react";
import { BookmarkIcon, ChevronDownIcon, Trash2Icon } from "lucide-react";

import { dict } from "@/shared/config";
import { Button } from "../button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../dialog";
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
import { Input } from "../input";
import { Label } from "../label";
import { FieldError } from "../field-error";
import type { RegistryView } from "./registry-settings-store";

const r = dict.common.registry;

/** Radix forbids "" as an item value; the built-in default view uses this. */
const DEFAULT_VIEW = "__default__";

export interface ViewsMenuProps {
  /** The screen's built-in view, e.g. «Усі замовлення». */
  defaultName: string;
  /**
   * The active quick view's name when it is NOT the one `defaultName` stands
   * for (TASK-1832) — e.g. «Видалені». With no saved view active the button
   * says this instead of the built-in name, and no radio is checked: the list
   * on screen is neither «Мої види» entry. `null` / omitted = the default.
   */
  quickViewName?: string | null;
  views: readonly RegistryView[];
  activeViewId: string | null;
  onApply: (id: string | null) => void;
  onSave: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

/**
 * «Вид» (OrdersProposal П4): the operator's saved combinations of filters,
 * columns, widths, sort and density. «Мої види» are radio items (the active one
 * is checked), saving and managing open dialogs — a name needs a text field,
 * which a menu cannot hold.
 */
export function ViewsMenu({
  defaultName,
  quickViewName = null,
  views,
  activeViewId,
  onApply,
  onSave,
  onRename,
  onDelete,
}: ViewsMenuProps) {
  const [saving, setSaving] = React.useState(false);
  const [managing, setManaging] = React.useState(false);
  const savedName = views.find((view) => view.id === activeViewId)?.name;
  const activeName = savedName ?? quickViewName ?? defaultName;

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="min-w-0">
            <BookmarkIcon aria-hidden="true" />
            <span className="truncate">{r.view(activeName)}</span>
            <ChevronDownIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-75">
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
            {r.myViews}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={
              savedName !== undefined
                ? (activeViewId ?? DEFAULT_VIEW)
                : quickViewName !== null
                  ? ""
                  : DEFAULT_VIEW
            }
            onValueChange={(value) =>
              onApply(value === DEFAULT_VIEW ? null : value)
            }
          >
            <DropdownMenuRadioItem
              value={DEFAULT_VIEW}
              className="data-[state=checked]:bg-accent"
            >
              {defaultName}
            </DropdownMenuRadioItem>
            {views.map((view) => (
              <DropdownMenuRadioItem
                key={view.id}
                value={view.id}
                className="data-[state=checked]:bg-accent"
              >
                {view.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSaving(true)}>
            {r.saveView}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setManaging(true)}>
            {r.manageViews}
          </DropdownMenuItem>
          <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">
            {r.viewsFootnote}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>

      <SaveViewDialog
        open={saving}
        onOpenChange={setSaving}
        onSave={(name) => {
          onSave(name);
          setSaving(false);
        }}
      />
      <ManageViewsDialog
        open={managing}
        onOpenChange={setManaging}
        views={views}
        onRename={onRename}
        onDelete={onDelete}
      />
    </>
  );
}

function SaveViewDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState(false);
  const inputId = React.useId();
  const errorId = React.useId();

  // A fresh, empty form every time the dialog opens (render-time guard).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setError(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) {
              setError(true);
              return;
            }
            onSave(name.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>{r.saveViewTitle}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={inputId}>{r.viewNameLabel}</Label>
            <Input
              id={inputId}
              value={name}
              autoComplete="off"
              aria-invalid={error || undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(false);
              }}
            />
            {error ? (
              <FieldError id={errorId}>{r.viewNameRequired}</FieldError>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {dict.common.cancel}
            </Button>
            <Button type="submit">{dict.common.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManageViewsDialog({
  open,
  onOpenChange,
  views,
  onRename,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  views: readonly RegistryView[];
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{r.manageViewsTitle}</DialogTitle>
        </DialogHeader>
        {views.length === 0 ? (
          <p className="text-sm text-muted-foreground">{r.noSavedViews}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {views.map((view) => (
              <ManagedView
                key={view.id}
                view={view}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {dict.common.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One row: the name is renamed on blur / Enter; an empty name is not saved. */
function ManagedView({
  view,
  onRename,
  onDelete,
}: {
  view: RegistryView;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = React.useState(view.name);
  // Re-seed when the stored name changes under us (rule 1a).
  const [synced, setSynced] = React.useState(view.name);
  if (view.name !== synced) {
    setSynced(view.name);
    setName(view.name);
  }
  const commit = () => {
    if (name.trim() && name.trim() !== view.name) onRename(view.id, name);
    else setName(view.name);
  };
  return (
    <li className="flex items-center gap-2">
      <Input
        value={name}
        aria-label={r.renameViewAria(view.name)}
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={r.deleteViewAria(view.name)}
        onClick={() => onDelete(view.id)}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2Icon aria-hidden="true" />
      </Button>
    </li>
  );
}
