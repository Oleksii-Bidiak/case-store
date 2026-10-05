"use client";

import * as React from "react";
import { ChevronDown, ImageIcon, Link2, Upload } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { dict } from "@/shared/config";
import type { RichTextImageSources } from "./image-sources";

const t = dict.richTextEditor;

/** Where a picture from any source goes: at the caret, or over a picture. */
export type RichTextImageTarget =
  { kind: "insert" } | { kind: "replace"; pos: number };

/**
 * What the editor lends to the image menu and to every picture's node view.
 *
 * A context because the node views are rendered by Tiptap through portals
 * under `EditorContent`, and the menu by the caller's toolbar slot — both far
 * from the component that owns this state, and neither reachable by props.
 */
export interface RichTextImageActions {
  sources: RichTextImageSources | null;
  /** The editor is not `disabled`. */
  editable: boolean;
  /** Open the media library; the pick goes to `target`. */
  openLibrary: (target: RichTextImageTarget) => void;
  /** Open the file dialog; the chosen file uploads into `target`. */
  pickFile: (target: RichTextImageTarget) => void;
  /** Open the address row under the toolbar for `target`. */
  openUrl: (target: RichTextImageTarget) => void;
}

export const RichTextImageActionsContext =
  React.createContext<RichTextImageActions | null>(null);

/**
 * «З медіатеки… / Завантажити з комп’ютера… / За посиланням…» — the same three
 * items in the toolbar's «Зображення ▾» and in a picture's «Замінити…», so the
 * two menus cannot drift apart. Items whose source the slot did not register
 * are simply absent; the address needs no API and is always there.
 */
export function ImageSourceMenuItems({
  target,
  withHint = false,
}: {
  target: RichTextImageTarget;
  withHint?: boolean;
}) {
  const actions = React.useContext(RichTextImageActionsContext);
  if (!actions) return null;
  const { sources } = actions;

  return (
    <>
      {sources?.openLibrary && (
        <DropdownMenuItem onSelect={() => actions.openLibrary(target)}>
          <ImageIcon aria-hidden="true" />
          {t.imageFromLibrary}
        </DropdownMenuItem>
      )}
      {sources?.upload && (
        <DropdownMenuItem onSelect={() => actions.pickFile(target)}>
          <Upload aria-hidden="true" />
          {t.imageUpload}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={() => actions.openUrl(target)}>
        <Link2 aria-hidden="true" />
        {t.imageByUrl}
      </DropdownMenuItem>
      {withHint && sources?.upload && (
        <>
          <DropdownMenuSeparator />
          <p className="max-w-72 px-2 py-1.5 text-xs text-muted-foreground">
            {t.imageMenuHint}
          </p>
        </>
      )}
    </>
  );
}

/**
 * «Зображення ▾» — the toolbar button for pictures (wave 198, РЕ1).
 *
 * Rendered BY THE SLOT (`MediaPickerEditorButton`), not by the editor: the
 * slot is what knows whether this operator may use the media library at all,
 * and an operator with no media keys keeps the toolbar they had — no image
 * control. The items come from the editor through context; outside an editor
 * (a form test that stubs it) the button still renders, with nothing to offer.
 *
 * Styled as the toolbar's own 28px buttons. `modal={false}`: an item may open
 * the library DIALOG, and a modal menu closing under a modal dialog leaves the
 * page's pointer lock in a race.
 */
export function RichTextImageMenu({ label = t.imageMenu }: { label?: string }) {
  const actions = React.useContext(RichTextImageActionsContext);
  const editable = actions?.editable ?? true;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        type="button"
        title={label}
        aria-label={label}
        disabled={!editable}
        className={cn(
          "inline-flex h-7 items-center justify-center gap-0.5 rounded-sm px-1.5 text-muted-foreground transition-colors outline-none",
          "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
          "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
          "disabled:pointer-events-none disabled:bg-disabled disabled:text-disabled-foreground",
        )}
      >
        <ImageIcon className="size-4" aria-hidden="true" />
        <ChevronDown className="size-3" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <ImageSourceMenuItems target={{ kind: "insert" }} withHint />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
