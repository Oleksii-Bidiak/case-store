"use client";

/**
 * SetColorDialog — the colour picker for the product list's bulk «Задати колір»
 * (TASK-487).
 *
 * A dialog rather than an input in the bulk bar, for the reason
 * `MoveToGroupDialog` is one: the action needs a VALUE, the bar is a row of
 * verbs, and making the operator type the colour and then press a verb puts the
 * count in front of them at the moment of commitment.
 *
 * A free-text box rather than a closed dropdown, deliberately. The colour
 * vocabulary is not fixed — it grows with the catalogue, and this dialog is
 * often how a new colour enters it (the API widens the `Колір` SELECT's option
 * list to cover whatever it is handed). The `datalist` offers the colours
 * already in use so the common case is one keystroke and «Чорний» never drifts
 * into «чорний», while a genuinely new «Пісочний» still gets through.
 */

import * as React from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const t = dict.products.bulk;

export interface SetColorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many products the write will touch — shown in the description. */
  selectedCount: number;
  /** Colours already in use, offered as suggestions. */
  suggestions?: string[];
  isPending?: boolean;
  /** `null` = remove the colour. */
  onConfirm: (color: string | null) => void;
}

export function SetColorDialog({
  open,
  onOpenChange,
  selectedCount,
  suggestions = [],
  isPending = false,
  onConfirm,
}: SetColorDialogProps) {
  const [value, setValue] = React.useState("");

  // A dialog that remembers last time's colour is a dialog that writes the wrong
  // colour to the next selection. Reset on the transition INTO open.
  //
  // Adjusted during render rather than in an effect: an effect would paint the
  // previous value for one frame before clearing it, and `react-hooks/
  // set-state-in-effect` rejects the synchronous setState outright. This is the
  // render-time guard from docs/conventions/forms.md rule 1a — and `key`-
  // remounting is not an option here, the input takes focus.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue("");
  }

  const trimmed = value.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.colorDialogTitle}</DialogTitle>
          <DialogDescription>
            {t.colorDialogDescription(selectedCount)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-color-input">{t.colorDialogLabel}</Label>
          <Input
            id="bulk-color-input"
            list="bulk-color-suggestions"
            value={value}
            placeholder={t.colorDialogPlaceholder}
            aria-describedby="bulk-color-hint"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && trimmed !== "" && !isPending) {
                event.preventDefault();
                onConfirm(trimmed);
              }
            }}
          />
          <datalist id="bulk-color-suggestions">
            {suggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
          <p id="bulk-color-hint" className="text-xs text-muted-foreground">
            {t.colorDialogHint}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {dict.common.cancel}
          </Button>
          {/* Clearing is its own button rather than "submit an empty box":
              removing a colour takes the products out of the colour filter, and
              that is a decision worth pressing on purpose. The hook confirms it
              as well. */}
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onConfirm(null)}
          >
            {t.colorClear}
          </Button>
          <Button
            type="button"
            // Nothing typed ⇒ nothing to write. It stays disabled rather than
            // falling through to "clear", which would make an empty box quietly
            // destructive.
            disabled={isPending || trimmed === ""}
            onClick={() => onConfirm(trimmed)}
          >
            {t.colorSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
