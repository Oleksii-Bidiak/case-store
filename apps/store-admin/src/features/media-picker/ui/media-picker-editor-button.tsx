"use client";

import { ImageIcon } from "lucide-react";
import type { RichTextImage } from "@/shared/ui";
import { dict } from "@/shared/config";
import { MediaPicker } from "./media-picker";

const t = dict.mediaPicker;

export interface MediaPickerEditorButtonProps {
  /** The editor's own insert callback, handed to the slot by `RichTextEditor`. */
  insert: (image: RichTextImage) => void;
}

/**
 * The media picker as a rich-text toolbar button (TASK-547).
 *
 * WHY IT EXISTS AS ITS OWN COMPONENT. `RichTextEditor` lives in `shared/ui` and
 * therefore may not import `@/entities/media` or this feature — so it takes the
 * image control as a SLOT instead. Three forms fill that slot (product, page,
 * article), and without this they would each be carrying a copy of the toolbar
 * button's markup: one would end up a pixel taller, or without the tooltip, and
 * nobody would notice for months.
 *
 * The styling is deliberately the editor's own button styling rather than the
 * app's `<Button>`: this control sits inside a strip of 28px icon buttons, and
 * an outline button there reads as something bolted onto the toolbar rather
 * than part of it. If those classes change in `rich-text-editor.tsx`, they
 * change here too — the pair is named in both files.
 *
 * The alt text comes along with the picture. That is the entire reason the
 * library stores one: an image dropped into an article body with no alt is an
 * accessibility defect, and asking the operator to retype it per article is how
 * it stays one.
 */
export function MediaPickerEditorButton({
  insert,
}: MediaPickerEditorButtonProps) {
  return (
    <MediaPicker onPick={(asset) => insert({ src: asset.url, alt: asset.alt })}>
      <button
        type="button"
        title={t.editorInsert}
        aria-label={t.editorInsert}
        className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <ImageIcon className="h-4 w-4" />
      </button>
    </MediaPicker>
  );
}
