"use client";

/**
 * MoveToGroupDialog — the target picker for the product list's bulk
 * «Перемістити до групи» (TASK-423).
 *
 * A dialog rather than a second `Select` in the bulk bar, for one reason: the
 * action needs a TARGET, and the bar is a row of verbs. Making the operator pick
 * a group first and then press a verb also makes the count visible at the moment
 * of commitment, which is the part of a bulk action worth being sure about.
 *
 * The picker is the zero-dependency `Combobox` — the group list is unbounded (a
 * catalogue of colour families runs to dozens), and a drop-down of dozens can
 * only be scrolled. «Без групи» is a real entry, because taking a set of
 * positions back OUT of a group is the other half of this action.
 */

import * as React from "react";

import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  type ComboboxOption,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const t = dict.products.bulk;

/** Sentinel for the «Без групи» entry — distinguishes "ungroup" from "unpicked". */
const UNGROUP = "__ungroup__";

export interface MoveToGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many products the move will write — shown in the description. */
  selectedCount: number;
  groups: { id: string; name: string }[];
  isLoadingGroups?: boolean;
  isPending?: boolean;
  /** `null` = take the products out of their group. */
  onConfirm: (groupId: string | null) => void;
}

export function MoveToGroupDialog({
  open,
  onOpenChange,
  selectedCount,
  groups,
  isLoadingGroups = false,
  isPending = false,
  onConfirm,
}: MoveToGroupDialogProps) {
  const [text, setText] = React.useState("");
  const [picked, setPicked] = React.useState<ComboboxOption | null>(null);

  // A dialog that remembers last time's target is a dialog that writes the wrong
  // group to the next selection. Reset on the transition into open.
  //
  // Adjusted during render rather than in an effect: an effect would paint the
  // previous target for one frame before clearing it, and `react-hooks/
  // set-state-in-effect` rejects the synchronous setState outright. This is the
  // render-time guard from docs/conventions/forms.md rule 1a.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText("");
      setPicked(null);
    }
  }

  const options: ComboboxOption[] = [
    { value: UNGROUP, label: t.groupNone },
    ...groups.map((group) => ({ value: group.id, label: group.name })),
  ];

  const needle = text.trim().toLowerCase();
  const visible =
    needle === "" || (picked !== null && text === picked.label)
      ? options
      : options.filter((option) => option.label.toLowerCase().includes(needle));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.groupDialogTitle}</DialogTitle>
          <DialogDescription>
            {t.groupDialogDescription(selectedCount)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-group-picker">{t.groupDialogLabel}</Label>
          <Combobox
            id="bulk-group-picker"
            value={text}
            options={visible}
            isLoading={isLoadingGroups}
            placeholder={t.groupDialogPlaceholder}
            loadingText={dict.common.loading}
            emptyText={t.groupDialogEmpty}
            onInputChange={(next) => {
              setText(next);
              // Typing after a pick invalidates it: the box no longer names what
              // would be written, and «Перемістити» must not act on a stale id.
              setPicked(null);
            }}
            onSelect={(option) => {
              setPicked(option);
              setText(option.label);
            }}
          />
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
          <Button
            type="button"
            // Nothing picked ⇒ nothing to write. The button stays disabled rather
            // than defaulting to a group, because the default would be a silent
            // guess about which family these products belong to.
            disabled={isPending || picked === null}
            onClick={() => {
              if (picked === null) return;
              onConfirm(picked.value === UNGROUP ? null : picked.value);
            }}
          >
            {t.groupSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
